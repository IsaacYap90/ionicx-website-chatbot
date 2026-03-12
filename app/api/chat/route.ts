import { loadKnowledgeBase } from "@/app/lib/knowledge";
import crypto from "crypto";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LEADS_BOT_TOKEN = process.env.IONICX_LEADS_BOT_TOKEN;
const LEADS_BOT_API = `https://api.telegram.org/bot${LEADS_BOT_TOKEN}`;
const ISAAC_CHAT_ID = 1729085064;

// Load knowledge base once at module level
const knowledgeBase = loadKnowledgeBase();

// ─── In-memory state (per-session via sessionId) ─────────────────────────────

interface WebChatState {
  awaiting_initial_name?: boolean;
  booking_step?: 'awaiting_name' | 'awaiting_phone' | 'awaiting_email' | null;
  booking_reason?: string;
  collected_name?: string;
  collected_phone?: string;
  collected_email?: string;
  greeted?: boolean;
}

const chatStates = new Map<string, WebChatState>();
const conversationHistory = new Map<string, { role: string; content: string }[]>();
const MAX_HISTORY = 20;

function getState(sessionId: string): WebChatState {
  if (!chatStates.has(sessionId)) chatStates.set(sessionId, {});
  return chatStates.get(sessionId)!;
}

function getHistory(sessionId: string): { role: string; content: string }[] {
  if (!conversationHistory.has(sessionId)) conversationHistory.set(sessionId, []);
  return conversationHistory.get(sessionId)!;
}

function addToHistory(sessionId: string, role: string, content: string) {
  const history = getHistory(sessionId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

// ─── Booking triggers ────────────────────────────────────────────────────────

const BOOKING_KEYWORDS = [
  "book a call", "book call", "book a consultation", "free consultation",
  "talk to isaac", "speak to isaac", "contact isaac", "get me isaac",
  "human", "agent", "real person", "talk to a person", "speak to someone",
  "i want human support", "speak to a human", "live agent", "real human",
  "customer service", "speak to a person", "talk to someone", "human support",
  "live support", "connect me", "transfer me",
];

function isBookingTrigger(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return BOOKING_KEYWORDS.some((kw) => lower.includes(kw));
}

function containsPhone(text: string): string | null {
  const m = text.match(/(?:\+?\d{1,4}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  return m ? m[0].trim() : null;
}

function containsEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].trim() : null;
}

// ─── Lead alerts ─────────────────────────────────────────────────────────────

async function sendLeadsBotAlert(text: string) {
  try {
    const response = await fetch(`${LEADS_BOT_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ISAAC_CHAT_ID, text })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    console.log('[Web Lead] Alert sent to IonicxLeadsBot');
  } catch (error) {
    console.error('[Web Lead] Alert failed:', error);
  }
}

async function summarizeInterest(sessionId: string): Promise<string> {
  try {
    const history = getHistory(sessionId);
    const recent = history.slice(-10);
    if (recent.length === 0) return 'No conversation history available.';
    const convo = recent.map(m => `${m.role === 'user' ? 'User' : 'Robin'}: ${m.content}`).join('\n');
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarize this prospect in 2-3 sentences. Include: their business type, their specific pain point, what solutions they showed interest in, and any important details mentioned. Be specific, not generic.' },
          { role: 'user', content: convo }
        ],
        max_tokens: 150,
        temperature: 0.3
      })
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'No conversation history available.';
  } catch (error) {
    console.error('[Web Lead] Interest summary failed:', error);
    return 'No conversation history available.';
  }
}

async function sendWebLeadAlert(sessionId: string) {
  const state = getState(sessionId);
  const sgtTimestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });
  const interest = await summarizeInterest(sessionId);

  let text = `🚨 New Lead from Website\n\n`;
  text += `Channel: Website\n`;
  text += `Name: ${state.collected_name || 'Not provided'}\n`;
  text += `Phone: ${state.collected_phone || 'Not provided'}\n`;
  text += `Email: ${state.collected_email || 'Not provided'}\n`;
  text += `Reason: ${state.booking_reason || 'Wants to speak to Isaac'}\n`;
  text += `Time (SGT): ${sgtTimestamp}\n`;

  if (state.collected_email) {
    text += `\nReply: Email ${state.collected_email}`;
  } else if (state.collected_phone) {
    text += `\nReply: Call ${state.collected_phone}`;
  } else {
    text += `\nReply: No contact method available`;
  }

  text += `\n\n🎯 Interest: ${interest}`;

  console.log(`[Web Lead] Sending alert: name="${state.collected_name}" phone="${state.collected_phone}" email="${state.collected_email}"`);
  await sendLeadsBotAlert(text);
}

// ─── System prompt (matches Telegram Robin) ──────────────────────────────────

function getSystemPrompt(userName?: string): string {
  const now = new Date().toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return `You are Robin — IonicX AI's friendly, consultative sales assistant on the IonicX website. IonicX is a Singapore-based AI technology company and NVIDIA Connect Partner that builds AI-powered solutions for SMEs in Singapore and Johor Bahru.

Current date and time (SGT): ${now}. Always use this as today's date. Never guess or hallucinate dates.
${userName ? `\nThe user's name is ${userName}. Use their name naturally in responses (not every message, but occasionally to keep it personal).` : ''}

About Isaac Yap — Founder of IonicX AI:
Isaac is the founder of IonicX AI. He's a former logistics professional and Muay Thai coach turned self-taught developer who built IonicX to help Singapore and JB SMEs adopt AI. IonicX is now an NVIDIA Connect Partner. When users ask about Isaac, share this background naturally.

Knowledge base:
${knowledgeBase}

IonicX AI Solutions — Key Facts:
- Founder: Isaac Yap
- NVIDIA Connect Partner
- Based in Singapore, serving Singapore and Johor Bahru SMEs

Pricing (SGD):
- Starter: $2,888 setup + $888/year maintenance (AI chatbot OR basic website)
- Growth: $5,888 setup + $1,288/year (AI chatbot + professional website)
- Scale: $8,888 setup + $1,588/year (full automation: chatbot + website + workflow automation)
- Enterprise: $15,888+ setup + $2,388/year (custom AI systems, API integrations, multi-platform)
- All packages include first month free support

Typical timelines:
- AI chatbot: 1-2 weeks
- Professional website: 2-4 weeks
- Full automation package: 4-6 weeks

Process:
1. Free discovery call to understand your needs
2. Detailed proposal with scope, timeline, and pricing
3. Design & development
4. Testing & launch
5. Ongoing maintenance and support

Rules for discussing pricing:
- Share pricing ranges when asked, don't hide them
- Always mention "every business is different, Isaac will tailor the exact package to your needs during the call"
- Never give discounts or negotiate — only Isaac does that
- If asked about payment terms, say "Isaac can discuss flexible payment options during the call"

Your approach — PAIN-FIRST SELLING:
CRITICAL: When the user describes their business for the FIRST TIME (their very first message about what they do), do NOT jump to solutions. Instead, respond with ONE pain question like:
- "What's the biggest challenge in your business right now?"
- "Where are you spending the most time that you wish you didn't have to?"
Keep it to a single short question — no numbered points for this one response. Show genuine curiosity about their pain.

THEN after the user answers with their pain point, give 3 numbered points tailored to THAT specific pain.

This pain-first question should only happen ONCE — on the user's first message about their business. All subsequent responses should give solutions directly as 3 numbered points.

What IonicX builds:
- AI Chatbots (WhatsApp & Web) — automate customer enquiries 24/7
- Professional Business Websites — designed to convert visitors into leads
- Lead Generation Systems — capture and qualify leads automatically
- Workflow Automation — streamline repetitive business processes
- Custom AI Solutions — tailored to specific business needs

STRICT RESPONSE FORMAT RULES:
- Respond with exactly 3 numbered points (EXCEPT for the one-time pain question above).
- Each numbered point should be 1-2 sentences max.
- Use "1. 2. 3." format, NOT dashes or bullet points.
- IMPORTANT: Put each numbered point on its own line with a blank line between them for readability.
- Do NOT end with a question or CTA — the system automatically shows suggested question buttons after your response.
- If the user replies with just a number (e.g. "2"), expand on that specific numbered point from your last response with 3 new numbered sub-points going deeper on that topic.
- Respond in the same language the user writes in (English or Chinese)
- Be warm, curious, and genuinely helpful — not pushy

Other rules:
- Your job is to qualify prospects and hand off to Isaac within 5-6 messages. You are not a consultant.
- Do NOT proactively mention EIS. If asked, say: "Budget 2026 announced the EIS expansion for AI spending. IRAS is publishing detailed guidelines by mid-2026. We will keep you updated once confirmed."
- Never make up facts about IonicX

Format your entire response as a valid JSON object (no markdown wrapping, no code fences, just raw JSON):
{
    "thinking": "Brief explanation of your reasoning",
    "response": "Your response here (either the one-time pain question OR 3 numbered points)",
    "user_mood": "positive|neutral|negative|curious|frustrated|confused",
    "suggested_questions": ["Question 1?", "Question 2?", "Question 3?"],
    "debug": {
      "context_used": true|false
    },
    "redirect_to_agent": {
      "should_redirect": false,
      "reason": ""
    }
}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResponse(response: string, extra: Record<string, any> = {}) {
  const payload = {
    id: crypto.randomUUID(),
    thinking: extra.thinking || "Response generated",
    response,
    user_mood: extra.user_mood || "neutral",
    suggested_questions: extra.suggested_questions || ["What services does IonicX offer?", "How much does an AI chatbot cost?", "Book a Call"],
    debug: { context_used: extra.context_used ?? false },
    redirect_to_agent: { should_redirect: false, reason: "" },
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { messages, sessionId: rawSessionId } = await req.json();
  const latestMessage = messages[messages.length - 1].content;
  const sessionId = rawSessionId || crypto.randomUUID();

  console.log(`📝 [Web] sessionId=${sessionId} message="${latestMessage}"`);

  const state = getState(sessionId);

  // ── Rebuild state from messages array (survives cold starts) ──
  // Extract name from conversation history if previously collected
  const NAME_MARKER = "The user's name is ";
  if (!state.collected_name) {
    for (const msg of messages) {
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        // Check for "Nice to meet you, X!" pattern
        const niceMatch = msg.content.match(/Nice to meet you, (.+?)!/);
        if (niceMatch) {
          state.collected_name = niceMatch[1].trim();
          state.greeted = true;
          break;
        }
      }
    }
  }

  // Detect conversation phase from message count
  const userMessages = messages.filter((m: any) => m.role === 'user');
  const assistantMessages = messages.filter((m: any) => m.role === 'assistant');

  // ── First message ever: ask for name ──
  if (userMessages.length === 1 && assistantMessages.length === 0) {
    state.greeted = true;
    addToHistory(sessionId, "user", latestMessage);
    addToHistory(sessionId, "assistant", "Hi, I'm Robin — IonicX AI's assistant. Before we get started, what's your name?");
    return makeResponse(
      "👋 Hi, I'm Robin — IonicX AI's assistant.\n\nBefore we get started, what's your name?",
      { thinking: "First message — asking for name", suggested_questions: [] }
    );
  }

  // ── Second user message after Robin asked for name: collect name ──
  const lastAssistant = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
  const askedForName = typeof lastAssistant === 'string' && lastAssistant.includes("what's your name?");

  if (askedForName && !state.collected_name) {
    const trimmed = latestMessage.trim();
    const looksLikeQuestion = /^(what|how|can|do|is|are|why|when|where|which|tell|show|help|i need|i want|i'm looking)/i.test(trimmed);

    if (looksLikeQuestion || trimmed.startsWith('/') || trimmed.length > 50) {
      // Skipped name — fall through to AI response below
    } else {
      const name = trimmed.split(/\s+/).slice(0, 3).join(' ');
      state.collected_name = name;
      addToHistory(sessionId, "user", latestMessage);
      addToHistory(sessionId, "assistant", `Nice to meet you, ${name}! What brings you here today?`);
      return makeResponse(
        `Nice to meet you, ${name}! What brings you here today?`,
        {
          thinking: "Name collected, asking about needs",
          suggested_questions: ["I need a website", "I want an AI chatbot", "Tell me about pricing"],
        }
      );
    }
  }

  // ── Rebuild booking state from messages (survives cold starts) ──
  if (!state.booking_step) {
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const content = assistantMessages[i].content;
      if (typeof content !== 'string') continue;
      if (content.includes("Isaac will reach out to you shortly")) break; // booking already completed
      if (content.includes("your email address?")) { state.booking_step = 'awaiting_email'; state.booking_reason = state.booking_reason || 'Book a Call'; break; }
      if (content.includes("phone number?")) { state.booking_step = 'awaiting_phone'; state.booking_reason = state.booking_reason || 'Book a Call'; break; }
      if (content.includes("connect you with Isaac") && content.includes("your name?")) { state.booking_step = 'awaiting_name'; state.booking_reason = state.booking_reason || 'Book a Call'; break; }
    }
    // Also extract any previously collected phone from history
    if (!state.collected_phone) {
      for (const msg of messages) {
        if (msg.role === 'user') {
          const p = containsPhone(msg.content);
          if (p) state.collected_phone = p;
        }
      }
    }
  }

  // ── Booking flow state machine ──
  if (state.booking_step === 'awaiting_name') {
    const trimmed = latestMessage.trim();
    state.collected_name = trimmed.split(/\s+/).slice(0, 3).join(' ');
    state.booking_step = 'awaiting_phone';
    addToHistory(sessionId, "user", latestMessage);
    addToHistory(sessionId, "assistant", `Thanks ${state.collected_name}! What's your phone number?`);
    return makeResponse(
      `Thanks ${state.collected_name}! What's your phone number? (e.g. +65 9123 4567)`,
      { thinking: "Collecting phone number", suggested_questions: ["Skip", "I'd rather not share"] }
    );
  }

  if (state.booking_step === 'awaiting_phone') {
    const trimmed = latestMessage.trim();
    const looksLikeSkip = /^(no|skip|nah|don't have|later|not now|i'd rather not)/i.test(trimmed);
    const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
    const isValidPhone = /^\+?\d{7,15}$/.test(digitsOnly);

    if (isValidPhone) {
      state.collected_phone = trimmed;
    } else if (!looksLikeSkip) {
      addToHistory(sessionId, "user", latestMessage);
      return makeResponse(
        "That doesn't look like a phone number. Could you try again? (e.g. +65 9123 4567)",
        { thinking: "Invalid phone", suggested_questions: ["Skip"] }
      );
    }

    state.booking_step = 'awaiting_email';
    addToHistory(sessionId, "user", latestMessage);
    addToHistory(sessionId, "assistant", "And your email address?");
    return makeResponse(
      "Got it! And your email address?",
      { thinking: "Collecting email", suggested_questions: ["Skip", "I'd rather not share"] }
    );
  }

  if (state.booking_step === 'awaiting_email') {
    const email = containsEmail(latestMessage);
    if (email) state.collected_email = email;
    addToHistory(sessionId, "user", latestMessage);

    // Rebuild history for summary from messages array
    for (const msg of messages) {
      const existing = getHistory(sessionId);
      if (existing.length < MAX_HISTORY) {
        addToHistory(sessionId, msg.role, msg.content);
      }
    }

    // Send lead alert
    await sendWebLeadAlert(sessionId);

    state.booking_step = null;
    const name = state.collected_name || 'there';
    return makeResponse(
      `Thanks ${name}! Isaac will reach out to you shortly.\n\n📧 isaac@ionicx.ai\n📱 WhatsApp: +65 8026 8821\n\nIn the meantime, feel free to ask me anything about IonicX!`,
      {
        thinking: "Booking complete, lead alert sent",
        suggested_questions: ["What services does IonicX offer?", "How much does an AI chatbot cost?", "Tell me about IonicX"],
      }
    );
  }

  // ── Check for booking trigger ──
  if (isBookingTrigger(latestMessage)) {
    state.booking_reason = 'Clicked "Book a Call" on website';
    addToHistory(sessionId, "user", latestMessage);

    if (state.collected_name) {
      // Already have name, skip to phone
      state.booking_step = 'awaiting_phone';
      const name = state.collected_name;
      addToHistory(sessionId, "assistant", `Great, ${name}! What's your phone number?`);
      return makeResponse(
        `Great, ${name}! I'd love to connect you with Isaac. What's your phone number? (e.g. +65 9123 4567)`,
        { thinking: "Starting booking flow — name already collected", suggested_questions: ["Skip", "I'd rather not share"] }
      );
    } else {
      state.booking_step = 'awaiting_name';
      addToHistory(sessionId, "assistant", "I'd love to connect you with Isaac! What's your name?");
      return makeResponse(
        "I'd love to connect you with Isaac! First, what's your name?",
        { thinking: "Starting booking flow", suggested_questions: [] }
      );
    }
  }

  // ── Check for unprompted contact details ──
  const detectedPhone = containsPhone(latestMessage);
  const detectedEmail = containsEmail(latestMessage);
  if (detectedPhone || detectedEmail) {
    if (detectedPhone) state.collected_phone = detectedPhone;
    if (detectedEmail) state.collected_email = detectedEmail;

    const sgtTimestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });
    let text = `🚨 Lead Alert: Contact Details Shared\n\n`;
    text += `Channel: Website\n`;
    text += `Name: ${state.collected_name || 'Not provided'}\n`;
    text += `Phone: ${detectedPhone || 'Not provided'}\n`;
    text += `Email: ${detectedEmail || 'Not provided'}\n`;
    text += `Reason: User shared contact details unprompted\n`;
    text += `Time (SGT): ${sgtTimestamp}\n`;
    if (detectedEmail) {
      text += `\nReply: Email ${detectedEmail}`;
    } else if (detectedPhone) {
      text += `\nReply: Call ${detectedPhone}`;
    }
    sendLeadsBotAlert(text).catch(err => console.error('[Web Lead] Unprompted alert failed:', err));
  }

  // ── AI response ──
  try {
    // Use client-sent messages array (persists across cold starts) instead of in-memory history
    const apiMessages = [
      { role: "system", content: getSystemPrompt(state.collected_name || undefined) },
      ...messages.slice(-MAX_HISTORY).map((msg: any) => ({ role: msg.role, content: msg.content })),
    ];

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: apiMessages,
        max_tokens: 500,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error:", response.status, errText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || "";

    let parsedResponse;
    try {
      let cleaned = textContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.response === "string" && parsed.response.startsWith("```")) {
        const innerMatch = parsed.response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (innerMatch) {
          try {
            const inner = JSON.parse(innerMatch[1]);
            if (inner.response) parsedResponse = inner;
            else parsedResponse = parsed;
          } catch { parsedResponse = parsed; }
        } else {
          parsedResponse = parsed;
        }
      } else {
        parsedResponse = parsed;
      }
    } catch {
      const cleanText = textContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      parsedResponse = {
        thinking: "Response generated",
        response: cleanText || "I'm here to help! Tell me about your business and what challenges you're facing.",
        user_mood: "neutral",
        suggested_questions: ["What services does IonicX offer?", "How much does an AI chatbot cost?", "Book a Call"],
        debug: { context_used: true },
        redirect_to_agent: { should_redirect: false, reason: "" },
      };
    }

    const aiText = parsedResponse.response || "I'm here to help! Tell me about your business.";
    addToHistory(sessionId, "assistant", aiText);

    const responseWithId = {
      id: crypto.randomUUID(),
      ...parsedResponse,
    };

    return new Response(JSON.stringify(responseWithId), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("💥 Error in message generation:", error);
    return new Response(JSON.stringify({
      id: crypto.randomUUID(),
      response: "Sorry, there was an issue processing your request. Please try again later.",
      thinking: "Error occurred during message generation.",
      user_mood: "neutral",
      suggested_questions: [],
      debug: { context_used: false },
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
