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

// In-memory conversation history (per chat ID, survives across warm invocations)
const conversationHistory = new Map<string, { role: string; content: string }[]>();
const MAX_HISTORY = 20; // Keep last 20 messages per chat

function getHistory(chatId: string): { role: string; content: string }[] {
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }
  return conversationHistory.get(chatId)!;
}

function addToHistory(chatId: string, role: string, content: string) {
  const history = getHistory(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// Dynamic system prompt with current SGT date/time injected on every call
function getSystemPrompt(): string {
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

  return `You are Robin — IonicX AI's friendly, consultative sales assistant on Telegram. IonicX is a Singapore-based AI technology company and NVIDIA Connect Partner that builds AI-powered solutions for SMEs in Singapore and Johor Bahru.

Current date and time (SGT): ${now}. Always use this as today's date. Never guess or hallucinate dates.

About Isaac Yap — Founder of IonicX AI:
Isaac is the founder of IonicX AI. He's a former logistics professional and Muay Thai coach turned self-taught developer who built IonicX to help Singapore and JB SMEs adopt AI. IonicX is now an NVIDIA Connect Partner. When users ask about Isaac, share this background naturally.

Knowledge base:
${knowledgeBase}

Your approach — PAIN-FIRST SELLING:
1. Ask about their business and what problems they face (don't jump to features)
2. Listen and empathise with their pain points
3. Connect their specific problems to IonicX solutions
4. Only then mention pricing if relevant
5. Always guide towards booking a free consultation with Isaac

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

Rules:
- Respond in the same language the user writes in (English or Chinese)
- Keep responses to 2-3 sentences max. Be conversational, not essay-length.
- Only use numbered lists or bullet points if the user explicitly asks for detail.
- Ask one question at a time. Do not stack multiple questions.
- Be warm, curious, and genuinely helpful — not pushy
- When you sense buying intent or the user wants to discuss specifics, suggest they tap "Talk to Isaac"
- If you don't know something, be honest and offer to connect them with Isaac
- You CANNOT book meetings or arrange calls yourself. When a user wants to book or schedule, say "Isaac will reach out to confirm" — never say "I'll arrange it"
- Do NOT proactively mention EIS. If asked, say: "Budget 2026 announced the EIS expansion for AI spending. IRAS is publishing detailed guidelines by mid-2026. We will keep you updated once confirmed."
- Never make up facts about IonicX

Escalation rules — set should_escalate to true ONLY when:
- User shares a phone number, email address, or other contact details (include the contact info in escalation_reason)
- User EXPLICITLY asks to speak to a human, real person, or Isaac (e.g. "can I talk to Isaac", "connect me to someone", "I want to speak to a real person")

Do NOT set should_escalate for:
- Questions ABOUT Isaac (e.g. "who is Isaac", "what does Isaac do")
- General conversation that happens to mention Isaac's name
- Casual affirmations like "yes", "yes please", "sure"
- Exploratory questions about consultations (e.g. "how does a consultation work?")
- General buying interest without explicit request for human contact

Format response as JSON:
{
    "response": "Your response to the user",
    "should_escalate": false,
    "escalation_reason": ""
}`;
}

async function sendTelegramMessage(chatId: string, text: string, options: any = {}) {
  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        ...options
      })
    });

    const data = await response.json();
    if (!data.ok) {
      // Retry without Markdown if parsing failed
      console.error('Telegram send failed, retrying without Markdown:', data.description);
      const retryResponse = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.replace(/[*_`\[\]]/g, ''),
          ...options
        })
      });
      return retryResponse.json();
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
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      })
    });

    const data = await response.json();
    if (!data.ok) {
      // Retry without Markdown if parsing failed
      console.error('Inline keyboard Markdown failed, retrying:', data.description);
      const retryResponse = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.replace(/[*_`\[\]]/g, ''),
          reply_markup: { inline_keyboard: buttons }
        })
      });
      return retryResponse.json();
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
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text }
      })
    });

    const data = await response.json();
    console.log('WhatsApp alert sent:', data);
    return data;
  } catch (error) {
    console.error('Error sending WhatsApp alert:', error);
    throw error;
  }
}

// Send alert via IonicX Leads Bot — NO Markdown to avoid underscore parsing issues
async function sendLeadsBotAlert(chatId: string | number, text: string) {
  const url = `${LEADS_BOT_API}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text
    // No parse_mode — plain text to avoid Markdown failures with URLs containing underscores
  };

  console.log('Sending Leads Bot alert to:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Leads Bot response:', JSON.stringify(data));

    if (!data.ok) {
      console.error('Leads Bot API error:', data.description);
      throw new Error(data.description);
    }

    console.log('Leads Bot alert sent successfully');
    return data;
  } catch (error) {
    console.error('Error sending Leads Bot alert:', error);
    throw error;
  }
}

async function getAIResponse(chatId: string, message: string): Promise<{ response: string; should_escalate: boolean; escalation_reason: string }> {
  try {
    // Build messages with conversation history and dynamic system prompt
    const history = getHistory(chatId);
    const messages = [
      { role: "system", content: getSystemPrompt() },
      ...history,
      { role: "user", content: message }
    ];

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 500,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || "";

    try {
      let cleaned = textContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();

      const parsed = JSON.parse(cleaned);
      const aiResponse = parsed.response || "I'm here to help! What does your business do?";

      // Save to conversation history
      addToHistory(chatId, "user", message);
      addToHistory(chatId, "assistant", aiResponse);

      return {
        response: aiResponse,
        should_escalate: parsed.should_escalate || false,
        escalation_reason: parsed.escalation_reason || ""
      };
    } catch (parseError) {
      const fallback = textContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || "I'm here to help! Tell me about your business and what challenges you're facing.";
      addToHistory(chatId, "user", message);
      addToHistory(chatId, "assistant", fallback);
      return {
        response: fallback,
        should_escalate: false,
        escalation_reason: ""
      };
    }
  } catch (error) {
    console.error("AI response error:", error);
    return {
      response: "Sorry, I'm having trouble right now. Please try again or contact Isaac directly at isaac@ionicx.ai",
      should_escalate: true,
      escalation_reason: "AI service error"
    };
  }
}

// Main menu keyboard
const mainMenuKeyboard = [
  [
    { text: '🚀 Services', callback_data: 'menu_services' },
    { text: '💰 Pricing', callback_data: 'menu_pricing' }
  ],
  [
    { text: '🎯 Our Work', callback_data: 'menu_demos' },
    { text: '👤 Talk to Isaac', callback_data: 'btn_human' }
  ]
];

// Knowledge base responses for menu buttons
const menuResponses: Record<string, string> = {
  menu_services: `🚀 *IonicX AI* builds AI-powered websites and WhatsApp chatbots for Singapore SMEs.

We help businesses:
✅ Automate customer enquiries 24/7
✅ Capture leads from WhatsApp and web
✅ Build professional websites that convert

*Our Services:*
• AI Chatbots (WhatsApp/Web)
• Professional Business Websites
• Lead Generation Systems
• Workflow Automation

Every business is different. We also build custom AI solutions tailored to your specific workflow. Tap "Talk to Isaac" to discuss.`,

  menu_pricing: `💰 *IonicX AI Pricing:*

*Starter — S$2,888 + S$888/year*
• 5-page website + basic chatbot

*Growth — S$5,888 + S$1,288/year*
• 10-page website + advanced AI

*Scale — S$8,888 + S$1,588/year*
• Custom web app + full automation

*Enterprise — S$15,888 + S$2,388/year*
• Bespoke AI solutions

Need something outside these tiers? We do custom builds too — tap "Talk to Isaac" to chat.`,

  menu_demos: `🎯 *See Our Work:*

• Fab The Stretch Lad
  fabthestretchlad.vercel.app

• TattByLyds
  tattbylyds.vercel.app

Want a custom demo for your business? Let's talk!`,

  menu_contact: `📞 *Contact IonicX AI*

*Isaac Yap — Founder*
📧 isaac@ionicx.ai
🌐 ionicx.ai
📱 WhatsApp: +65 8026 8821

*Office Hours:*
Mon-Fri: 9am - 6pm SGT`,

  btn_human: `Sure! Here's how to reach Isaac directly:

📧 isaac@ionicx.ai
📱 WhatsApp: +65 8026 8821

He typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).`,

  btn_menu: `👋 Hello! I'm Robin — IonicX AI's assistant.

I can help you with:
🚀 Our Services
💰 Pricing Plans
🎯 See Our Work
📞 Contact Us

Tap a button below or just tell me about your business needs!`
};

// Build plain-text alert (no Markdown to avoid URL underscore issues)
function buildAlertText(params: {
  title: string;
  userName: string;
  userHandle: string;
  chatId: string;
  timestamp: string;
  action: string;
  message?: string;
  reason?: string;
}): string {
  let text = `🚨 ${params.title}\n\nUser: ${params.userName}\nUsername: ${params.userHandle}\nChat ID: ${params.chatId}\nTime (SGT): ${params.timestamp}\n`;
  if (params.message) text += `Message: ${params.message}\n`;
  if (params.reason) text += `Reason: ${params.reason}\n`;
  text += `Action: ${params.action}\n\nReply: https://t.me/IonicXAI_Assistant`;
  return text;
}

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = query.message.chat.id.toString();
      const data = query.data;

      console.log(`Telegram callback from ${chatId}: ${data}`);

      // Answer the callback query (fire and forget)
      answerCallbackQuery(query.id).catch(err => console.error('Failed to answer callback:', err));

      // Handle "Talk to Isaac" button - trigger contact card + alerts
      if (data === 'btn_human') {
        console.log('Processing btn_human click...');

        try {
          await sendInlineKeyboard(chatId, menuResponses['btn_human'], mainMenuKeyboard);
        } catch (error) {
          console.error('Failed to send inline keyboard:', error);
        }

        // Build and send alert
        const user = update.callback_query.from;
        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        const userHandle = user.username ? `@${user.username}` : 'No username';
        const sgtTimestamp = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });

        const alertText = buildAlertText({
          title: 'Lead Alert: Talk to Isaac',
          userName,
          userHandle,
          chatId,
          timestamp: sgtTimestamp,
          action: 'Clicked "Talk to Isaac" button'
        });

        console.log('Sending Leads Bot alert to Isaac...');
        try {
          await sendLeadsBotAlert(ISAAC_CHAT_ID, alertText);
          console.log('Leads Bot alert sent');
        } catch (error) {
          console.error('Alert failed:', error);
        }

        // WhatsApp alert
        if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
          try {
            await sendWhatsAppMessage(ISAAC_WHATSAPP, alertText);
            console.log('WhatsApp alert sent');
          } catch (error) {
            console.error('WhatsApp alert failed:', error);
          }
        }

        console.log(`Alerts sent to Isaac for chat ${chatId} (Talk to Isaac button)`);
        return new Response('OK', { status: 200 });
      }

      // Send response based on button clicked (menu buttons get inline keyboard)
      const responseText = menuResponses[data] || menuResponses['btn_menu'];
      await sendInlineKeyboard(chatId, responseText, mainMenuKeyboard);

      return new Response('OK', { status: 200 });
    }

    // Handle regular messages with AI
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id.toString();
      const messageText = message.text || '';

      console.log(`Telegram message from ${chatId}: ${messageText}`);

      // Handle /start and /menu commands — reset conversation and show menu buttons
      if (messageText === '/start' || messageText === '/menu') {
        conversationHistory.delete(chatId);
        const welcomeText = `👋 Hi, I'm Robin — IonicX AI's assistant.

I'm here to help you explore how AI can automate your business. Whether it's a smart chatbot, a professional website, or full workflow automation — let's see what's possible.

What brings you here today?`;
        await sendInlineKeyboard(chatId, welcomeText, mainMenuKeyboard);
        return new Response('OK', { status: 200 });
      }

      // Get AI response with conversation history
      const aiResponse = await getAIResponse(chatId, messageText);

      // Send AI response WITHOUT inline buttons (no button spam on every message)
      await sendTelegramMessage(chatId, aiResponse.response);

      // Smart handoff: if escalation needed, alert Isaac
      if (aiResponse.should_escalate) {
        const escalationUser = message.from;
        const escalationName = escalationUser?.first_name + (escalationUser?.last_name ? ' ' + escalationUser.last_name : '');
        const escalationHandle = escalationUser?.username ? `@${escalationUser.username}` : 'No username';
        const escalationTime = new Date().toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' });

        const alertText = buildAlertText({
          title: 'Lead Alert from Telegram Bot',
          userName: escalationName,
          userHandle: escalationHandle,
          chatId,
          timestamp: escalationTime,
          action: 'Escalation triggered',
          message: messageText,
          reason: aiResponse.escalation_reason
        });

        try {
          await sendLeadsBotAlert(ISAAC_CHAT_ID, alertText);
          console.log('Leads Bot alert sent');
        } catch (error) {
          console.error('Leads Bot alert failed, falling back to main bot:', error);
          await sendTelegramMessage(ISAAC_CHAT_ID.toString(), alertText);
        }

        if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
          try {
            await sendWhatsAppMessage(ISAAC_WHATSAPP, alertText);
          } catch (error) {
            console.error('WhatsApp alert failed:', error);
          }
        }

        console.log(`Alerts sent to Isaac for chat ${chatId}`);
      }
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
    version: '3.0.0',
    features: ['AI conversations', 'conversation memory', 'lead alerts', 'pain-first selling', 'intent-based escalation', 'date awareness']
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
