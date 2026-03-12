// Telegram Bot API Route for IonicX AI Assistant
// Handles incoming Telegram messages with AI-powered responses and lead alerts

import { loadKnowledgeBase } from "@/app/lib/knowledge";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ISAAC_CHAT_ID = 1729085064;
const ISAAC_WHATSAPP = "6580268821";

// IonicX Leads Bot for alerts
const LEADS_BOT_TOKEN = process.env.IONICX_LEADS_BOT_TOKEN;
const LEADS_BOT_API = `https://api.telegram.org/bot${LEADS_BOT_TOKEN}`;

// WhatsApp Cloud API config
const WHATSAPP_API = () => `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_HEADERS = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
});

// Load knowledge base
const knowledgeBase = loadKnowledgeBase();

// ─── State management ───────────────────────────────────────────────────────

const conversationHistory = new Map<string, { role: string; content: string }[]>();
const MAX_HISTORY = 20;

interface ChatState {
  name?: string;
  awaiting_name?: boolean;
  booking_step?: 'awaiting_phone' | 'awaiting_email' | null;
  booking_reason?: string;
  collected_phone?: string;
  collected_email?: string;
}
const chatStates = new Map<string, ChatState>();

function getState(chatId: string): ChatState {
  if (!chatStates.has(chatId)) chatStates.set(chatId, {});
  return chatStates.get(chatId)!;
}

function getHistory(chatId: string): { role: string; content: string }[] {
  if (!conversationHistory.has(chatId)) conversationHistory.set(chatId, []);
  return conversationHistory.get(chatId)!;
}

function addToHistory(chatId: string, role: string, content: string) {
  const history = getHistory(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

// Name is stored as a system message in conversation history: "The user's name is [Name]."
// This travels with the OpenAI context on warm instances and provides the AI with the name.
const NAME_PREFIX = "The user's name is ";

function storeNameInHistory(chatId: string, name: string) {
  const history = getHistory(chatId);
  // Remove any existing name message to avoid duplicates
  const idx = history.findIndex(m => m.role === 'system' && m.content.startsWith(NAME_PREFIX));
  if (idx !== -1) history.splice(idx, 1);
  // Insert at the start so it's always present and never trimmed by MAX_HISTORY
  history.unshift({ role: 'system', content: `${NAME_PREFIX}${name}.` });
}

// Extract name: conversation history system message → chatStates → Telegram profile → "Unknown"
function getStoredName(chatId: string, telegramName?: string): string {
  const history = getHistory(chatId);
  for (const msg of history) {
    if (msg.role === 'system' && msg.content.startsWith(NAME_PREFIX)) {
      return msg.content.slice(NAME_PREFIX.length).replace(/\.$/, '').trim();
    }
  }
  const state = getState(chatId);
  if (state.name) return state.name;
  if (telegramName) return telegramName;
  return 'Unknown';
}

function getTelegramName(from: any): string {
  return (from?.first_name || '') + (from?.last_name ? ' ' + from.last_name : '');
}

function getUserHandle(from: any): string {
  return from?.username ? `@${from.username}` : 'No username';
}

// ─── Keyboards ──────────────────────────────────────────────────────────────

// Main menu — only after /start (post-name), /menu
const mainMenuKeyboard = [
  [
    { text: '🚀 Services', callback_data: 'menu_services' },
    { text: '💰 Pricing', callback_data: 'menu_pricing' }
  ],
  [
    { text: '🎯 Our Work', callback_data: 'menu_demos' },
    { text: '👤 Talk to Isaac', callback_data: 'btn_book' }
  ]
];

// CTA buttons — after EVERY AI response
const ctaKeyboard = [
  [
    { text: '📅 Book a Call', callback_data: 'btn_book' },
    { text: '❓ Ask More', callback_data: 'btn_ask' }
  ]
];

// Menu button responses
const menuResponses: Record<string, string> = {
  menu_services: `🚀 *IonicX AI* builds AI-powered solutions for Singapore SMEs.

1. AI Chatbots (WhatsApp/Web) — automate customer enquiries 24/7

2. Professional Websites — designed to convert visitors into leads

3. Lead Generation & Workflow Automation — capture leads and streamline processes

We also build custom AI solutions tailored to your specific workflow.`,

  menu_pricing: `💰 *IonicX AI Pricing:*

1. *Starter — S$2,888 + S$888/year* — 5-page website + basic chatbot

2. *Growth — S$5,888 + S$1,288/year* — 10-page website + advanced AI

3. *Scale — S$8,888 + S$1,588/year* — Custom web app + full automation

Enterprise and custom builds also available.`,

  menu_demos: `🎯 *See Our Work:*

1. Fab The Stretch Lad — fabthestretchlad.vercel.app

2. TattByLyds — tattbylyds.vercel.app

Want a custom demo for your business?`
};

// ─── System prompt ──────────────────────────────────────────────────────────

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

  const nameContext = userName
    ? `\nThe user's name is ${userName}. Use their name naturally in responses (not every message, but occasionally to keep it personal).`
    : '';

  return `You are Robin — IonicX AI's friendly, consultative sales assistant on Telegram. IonicX is a Singapore-based AI technology company and NVIDIA Connect Partner that builds AI-powered solutions for SMEs in Singapore and Johor Bahru.

Current date and time (SGT): ${now}. Always use this as today's date. Never guess or hallucinate dates.
${nameContext}

About Isaac Yap — Founder of IonicX AI:
Isaac is the founder of IonicX AI. He's a former logistics professional and Muay Thai coach turned self-taught developer who built IonicX to help Singapore and JB SMEs adopt AI. IonicX is now an NVIDIA Connect Partner. When users ask about Isaac, share this background naturally.

Knowledge base:
${knowledgeBase}

Your approach — PAIN-FIRST SELLING:
1. Ask about their business and what problems they face (don't jump to features)
2. Listen and empathise with their pain points
3. Connect their specific problems to IonicX solutions
4. Only then mention pricing if relevant
5. Guide towards booking a free consultation with Isaac

What IonicX builds:
- AI Chatbots (WhatsApp & Web) — automate customer enquiries 24/7
- Professional Business Websites — designed to convert visitors into leads
- Lead Generation Systems — capture and qualify leads automatically
- Workflow Automation — streamline repetitive business processes
- Custom AI Solutions — tailored to specific business needs

Pricing (only share when asked or when it naturally fits):
- Starter: S$2,888 + S$888/year (5-page website + basic chatbot)
- Growth: S$5,888 + S$1,288/year (10-page website + advanced AI)
- Scale: S$8,888 + S$1,588/year (custom web app + full automation)
- Enterprise: S$15,888 + S$2,388/year (bespoke AI solutions)
- Custom builds available for unique requirements

STRICT RESPONSE FORMAT RULES:
- Always respond with exactly 3 numbered points. No paragraphs. No exceptions.
- Each numbered point should be 1-2 sentences max.
- Use "1. 2. 3." format, NOT dashes or bullet points.
- IMPORTANT: Put each numbered point on its own line with a blank line between them for readability on Telegram.
- Do NOT end with a question or CTA — the system automatically shows "Book a Call" and "Ask More" buttons after your response.
- Example format:

1. We can build a 24/7 AI chatbot to handle your customer enquiries automatically.

2. A professional website designed to convert visitors into paying customers.

3. Lead capture system so you never miss a potential client again.

- If the user replies with just a number (e.g. "2"), expand on that specific numbered point from your last response with 3 new numbered sub-points going deeper on that topic.
- Respond in the same language the user writes in (English or Chinese)
- Be warm, curious, and genuinely helpful — not pushy

Other rules:
- Your job is to qualify prospects and hand off to Isaac within 5-6 messages. You are not a consultant.
- Do NOT handle booking or scheduling yourself. The system manages that via buttons.
- Do NOT proactively mention EIS. If asked, say: "Budget 2026 announced the EIS expansion for AI spending. IRAS is publishing detailed guidelines by mid-2026. We will keep you updated once confirmed."
- Never make up facts about IonicX

Format response as JSON:
{
    "response": "Your 3 numbered points here"
}`;
}

// ─── Telegram helpers ───────────────────────────────────────────────────────

async function sendTelegramMessage(chatId: string, text: string, options: any = {}) {
  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', ...options })
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Telegram send failed, retrying without Markdown:', data.description);
      const retry = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text.replace(/[*_`\[\]]/g, ''), ...options })
      });
      return retry.json();
    }
    return data;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error;
  }
}

async function sendInlineKeyboard(chatId: string, text: string, buttons: any[][]) {
  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } })
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Inline keyboard Markdown failed, retrying:', data.description);
      const retry = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text.replace(/[*_`\[\]]/g, ''), reply_markup: { inline_keyboard: buttons } })
      });
      return retry.json();
    }
    return data;
  } catch (error) {
    console.error('Error sending keyboard:', error);
    throw error;
  }
}

async function answerCallbackQuery(queryId: string) {
  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: queryId })
    });
  } catch (error) {
    console.error('Error answering callback:', error);
  }
}

async function sendWhatsAppMessage(to: string, text: string) {
  try {
    const response = await fetch(WHATSAPP_API(), {
      method: 'POST',
      headers: WHATSAPP_HEADERS(),
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } })
    });
    const data = await response.json();
    console.log('WhatsApp alert sent:', data);
    return data;
  } catch (error) {
    console.error('Error sending WhatsApp alert:', error);
    throw error;
  }
}

// ─── Lead alerts ────────────────────────────────────────────────────────────

async function sendLeadsBotAlert(chatId: string | number, text: string) {
  const url = `${LEADS_BOT_API}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    console.log('Leads Bot alert sent successfully');
    return data;
  } catch (error) {
    console.error('Error sending Leads Bot alert:', error);
    throw error;
  }
}

async function summarizeInterest(chatId: string): Promise<string> {
  try {
    const history = getHistory(chatId);
    const recent = history.slice(-10);
    if (recent.length === 0) return 'See conversation context below.';
    const convo = recent.map(m => `${m.role === 'user' ? 'User' : 'Robin'}: ${m.content}`).join('\n');
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarize what this prospect wants in one line. Include their business type, what they\'re interested in, and any key details. Keep it under 20 words.' },
          { role: 'user', content: convo }
        ],
        max_tokens: 60,
        temperature: 0.3
      })
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'See conversation context below.';
  } catch (error) {
    console.error('Interest summary failed:', error);
    return 'See conversation context below.';
  }
}

function buildLeadAlertText(params: {
  title: string; prospectName: string; userHandle: string; chatId: string;
  timestamp: string; reason: string; phone?: string; email?: string; conversationContext?: string;
  interest?: string;
}): string {
  let text = `🚨 ${params.title}\n\nName: ${params.prospectName}\n`;
  if (params.interest) text += `🎯 Interest: ${params.interest}\n`;
  text += `Username: ${params.userHandle}\nChat ID: ${params.chatId}\n`;
  text += `Phone: ${params.phone || 'Not provided'}\n`;
  text += `Email: ${params.email || 'Not provided'}\n`;
  text += `Reason: ${params.reason}\nTime (SGT): ${params.timestamp}\n`;
  if (params.conversationContext) text += `Context: ${params.conversationContext}\n`;
  text += `\nReply: https://t.me/IonicXAI_Assistant`;
  return text;
}

async function sendLeadAlerts(alertText: string) {
  try {
    await sendLeadsBotAlert(ISAAC_CHAT_ID, alertText);
  } catch (error) {
    console.error('Leads Bot failed, falling back to main bot:', error);
    await sendTelegramMessage(ISAAC_CHAT_ID.toString(), alertText);
  }
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    sendWhatsAppMessage(ISAAC_WHATSAPP, alertText).catch(err => console.error('WhatsApp alert failed:', err));
  }
}

function getConversationSummary(chatId: string): string {
  const history = getHistory(chatId);
  const recent = history.slice(-6);
  if (recent.length === 0) return 'No prior conversation';
  return recent.map(m => `${m.role === 'user' ? 'User' : 'Robin'}: ${m.content.substring(0, 100)}`).join('\n');
}

// ─── Booking flow ───────────────────────────────────────────────────────────

function startBookingFlow(chatId: string, reason: string) {
  const state = getState(chatId);
  state.booking_step = 'awaiting_phone';
  state.booking_reason = reason;
  state.collected_phone = undefined;
  state.collected_email = undefined;
}

async function sendCompletedLeadAlert(chatId: string, userHandle: string, telegramName?: string) {
  const state = getState(chatId);
  const sgtTimestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });
  const interest = await summarizeInterest(chatId);
  const alertText = buildLeadAlertText({
    title: 'New Lead from Telegram Bot',
    prospectName: getStoredName(chatId, telegramName),
    userHandle, chatId, timestamp: sgtTimestamp,
    reason: state.booking_reason || 'Wants to speak to Isaac',
    phone: state.collected_phone, email: state.collected_email,
    conversationContext: getConversationSummary(chatId),
    interest
  });
  await sendLeadAlerts(alertText);
  console.log(`Lead alert sent for chat ${chatId}`);
  state.booking_step = null;
  state.booking_reason = undefined;
}

function containsPhone(text: string): string | null {
  const m = text.match(/(?:\+?\d{1,4}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  return m ? m[0].trim() : null;
}

function containsEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].trim() : null;
}

// ─── AI response ────────────────────────────────────────────────────────────

async function getAIResponse(chatId: string, message: string): Promise<string> {
  try {
    const history = getHistory(chatId);
    const resolvedName = getStoredName(chatId);
    // Name system message in history is useful context for OpenAI — include it as-is
    const messages = [
      { role: "system", content: getSystemPrompt(resolvedName !== 'Unknown' ? resolvedName : undefined) },
      ...history,
      { role: "user", content: message }
    ];

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens: 500, temperature: 0.5 }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || "";

    let aiText: string;
    try {
      let cleaned = textContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      const parsed = JSON.parse(cleaned);
      aiText = parsed.response || "I'm here to help! What does your business do?";
    } catch {
      aiText = textContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || "I'm here to help! Tell me about your business and what challenges you're facing.";
    }

    addToHistory(chatId, "user", message);
    addToHistory(chatId, "assistant", aiText);
    return aiText;
  } catch (error) {
    console.error("AI response error:", error);
    return "Sorry, I'm having trouble right now. Please try again or contact Isaac directly at isaac@ionicx.ai";
  }
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // ── Callback queries (button clicks) ──
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = query.message.chat.id.toString();
      const data = query.data;
      const state = getState(chatId);

      console.log(`Callback from ${chatId}: ${data}`);
      answerCallbackQuery(query.id).catch(err => console.error('Callback answer failed:', err));

      // "Book a Call" or "Talk to Isaac" → booking flow
      if (data === 'btn_book') {
        const resolved = getStoredName(chatId, getTelegramName(query.from));
        const name = resolved !== 'Unknown' ? resolved : 'there';
        startBookingFlow(chatId, 'Clicked "Book a Call"');
        await sendTelegramMessage(chatId, `Great, ${name}! What's your phone number?`);

        // Immediate alert that booking flow started
        const user = query.from;
        const sgtTimestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });
        const alertText = buildLeadAlertText({
          title: 'Lead Alert: Booking Started',
          prospectName: getStoredName(chatId, getTelegramName(user)),
          userHandle: getUserHandle(user), chatId, timestamp: sgtTimestamp,
          reason: 'Clicked "Book a Call" — collecting phone/email',
          conversationContext: getConversationSummary(chatId)
        });
        sendLeadAlerts(alertText).catch(err => console.error('Alert failed:', err));
        return new Response('OK', { status: 200 });
      }

      // "Ask More" → prompt for next question
      if (data === 'btn_ask') {
        const resolved = getStoredName(chatId, getTelegramName(query.from));
        const name = resolved !== 'Unknown' ? resolved : 'there';
        await sendTelegramMessage(chatId, `Sure, ${name}! What else would you like to know?`);
        return new Response('OK', { status: 200 });
      }

      // Menu button responses → show response with CTA buttons
      if (menuResponses[data]) {
        await sendInlineKeyboard(chatId, menuResponses[data], ctaKeyboard);
        return new Response('OK', { status: 200 });
      }

      // Fallback
      await sendInlineKeyboard(chatId, `What would you like to know?`, mainMenuKeyboard);
      return new Response('OK', { status: 200 });
    }

    // ── Regular messages ──
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id.toString();
      const messageText = message.text || '';
      const state = getState(chatId);

      console.log(`Message from ${chatId}: ${messageText}`);

      // Step 1: /start → ask for name
      if (messageText === '/start') {
        conversationHistory.delete(chatId);
        chatStates.set(chatId, { awaiting_name: true });
        await sendTelegramMessage(chatId, `👋 Hi, I'm Robin — IonicX AI's assistant.\n\nBefore we get started, what's your name?`);
        return new Response('OK', { status: 200 });
      }

      // /menu → show main menu
      if (messageText === '/menu') {
        const resolved = getStoredName(chatId);
        const greeting = resolved !== 'Unknown' ? `Hey ${resolved}! Here's what I can help with:` : `Here's what I can help with:`;
        await sendInlineKeyboard(chatId, greeting, mainMenuKeyboard);
        return new Response('OK', { status: 200 });
      }

      // Step 2: Awaiting name (explicit flag OR empty history fallback for cold starts)
      const history = getHistory(chatId);
      const isAwaitingName = state.awaiting_name || (!state.name && history.length === 0 && !state.booking_step);

      if (isAwaitingName) {
        const trimmed = messageText.trim();
        const looksLikeQuestion = /^(what|how|can|do|is|are|why|when|where|which|tell|show|help|i need|i want|i'm looking)/i.test(trimmed);

        if (looksLikeQuestion || trimmed.startsWith('/') || trimmed.length > 50) {
          // Skipped name — go straight to AI
          state.awaiting_name = false;
          const aiText = await getAIResponse(chatId, messageText);
          await sendInlineKeyboard(chatId, aiText, ctaKeyboard);
          return new Response('OK', { status: 200 });
        }

        // Store name in both chatStates AND conversation history
        const name = trimmed.split(/\s+/).slice(0, 3).join(' ');
        state.name = name;
        state.awaiting_name = false;
        storeNameInHistory(chatId, name);
        console.log(`User ${chatId} identified as: ${name}`);

        await sendInlineKeyboard(
          chatId,
          `Nice to meet you, ${name}! What brings you here today?`,
          mainMenuKeyboard
        );
        return new Response('OK', { status: 200 });
      }

      // === BOOKING FLOW STATE MACHINE ===
      // Sole responder during phone/email collection — never calls OpenAI
      if (state.booking_step === 'awaiting_phone') {
        const trimmed = messageText.trim();
        const looksLikeSkip = /^(no|skip|nah|don't have|later|not now|i'd rather not)/i.test(trimmed);
        // Validate phone: strip non-digit chars (except leading +), check 7-15 digits
        const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
        const isValidPhone = /^\+?\d{7,15}$/.test(digitsOnly);

        if (isValidPhone) {
          state.collected_phone = trimmed;
          state.booking_step = 'awaiting_email';
          await sendTelegramMessage(chatId, `Got it. And your email address?`);
        } else if (looksLikeSkip) {
          state.booking_step = 'awaiting_email';
          await sendTelegramMessage(chatId, `No worries! How about your email address?`);
        } else {
          // Not a valid phone — ask again
          await sendTelegramMessage(chatId, `That doesn't look like a phone number. Could you try again? (e.g. +65 9123 4567)`);
        }
        return new Response('OK', { status: 200 });
      }

      if (state.booking_step === 'awaiting_email') {
        const email = containsEmail(messageText);
        if (email) state.collected_email = email;
        await sendCompletedLeadAlert(chatId, getUserHandle(message.from), getTelegramName(message.from));
        const resolved = getStoredName(chatId, getTelegramName(message.from));
        const name = resolved !== 'Unknown' ? resolved : 'there';
        await sendTelegramMessage(chatId, `Thanks ${name}! Isaac will reach out to you shortly. In the meantime, feel free to ask me anything.`);
        return new Response('OK', { status: 200 });
      }
      // === END BOOKING FLOW ===

      // Check for unprompted contact details mid-conversation
      const detectedPhone = containsPhone(messageText);
      const detectedEmail = containsEmail(messageText);
      if (detectedPhone || detectedEmail) {
        const sgtTimestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });
        const alertText = buildLeadAlertText({
          title: 'Lead Alert: Contact Details Shared',
          prospectName: getStoredName(chatId, getTelegramName(message.from)),
          userHandle: getUserHandle(message.from), chatId, timestamp: sgtTimestamp,
          reason: 'User shared contact details unprompted',
          phone: detectedPhone || undefined, email: detectedEmail || undefined,
          conversationContext: getConversationSummary(chatId)
        });
        sendLeadAlerts(alertText).catch(err => console.error('Unprompted contact alert failed:', err));
      }

      // Steps 3-5: AI response + CTA buttons (Book / Ask Another)
      const aiText = await getAIResponse(chatId, messageText);
      await sendInlineKeyboard(chatId, aiText, ctaKeyboard);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return new Response('Error', { status: 200 });
  }
}

export async function GET(req: Request) {
  return new Response(JSON.stringify({
    status: 'Telegram bot webhook is active',
    bot: 'Robin - IonicX AI Sales Assistant',
    version: '5.0.0',
    features: ['AI conversations', 'conversation memory', 'lead alerts', 'pain-first selling', 'booking flow', 'CTA loop', 'name collection']
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
