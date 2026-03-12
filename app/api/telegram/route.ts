// Telegram Bot API Route for IonicX AI Assistant
// Handles incoming Telegram messages and responds using the same AI logic as web chat

import { loadKnowledgeBase } from "@/app/lib/knowledge";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ISAAC_CHAT_ID = 1729085064; // For Telegram escalation alerts (must be number)
const ISAAC_WHATSAPP = "6580268821"; // For WhatsApp escalation alerts

// IonicX Leads Bot for alerts
const LEADS_BOT_TOKEN = "LEADS_BOT_TOKEN_REDACTED";
const LEADS_BOT_API = `https://api.telegram.org/bot${LEADS_BOT_TOKEN}`;

// WhatsApp Cloud API config (for sending alerts to Isaac)
const WHATSAPP_API = () => `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WHATSAPP_HEADERS = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
});

// Load knowledge base
const knowledgeBase = loadKnowledgeBase();

const HUMAN_KEYWORDS = [
  "human", "agent", "real person", "talk to a person", "speak to someone",
  "i want human support", "get me isaac", "contact isaac", "talk to isaac",
  "speak to a human", "live agent", "real human", "customer service",
  "speak to a person", "talk to someone", "human support", "live support",
  "connect me", "transfer me", "isaac"
];

function isHumanEscalation(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return HUMAN_KEYWORDS.some((keyword) => lower.includes(keyword));
}

const systemPrompt = `You are IonicX AI Assistant — a friendly, professional sales and support agent for IonicX, a Singapore-based AI technology company.

Knowledge base:
${knowledgeBase}

Respond in the same language the user writes in (English or Chinese).

Guidelines:
- Be warm, helpful, and consultative
- Answer questions about IonicX services, pricing, and AI solutions
- Pricing: Starter S$2,888 / Growth S$5,888 / Scale S$8,888 / Enterprise S$15,888
- Suggest booking a free consultation
- If you don't know something, offer to connect with Isaac at isaac@isaacyap.ai or WhatsApp +65 8026 8821
- Do NOT proactively mention EIS. If asked, say: "Budget 2026 announced the EIS expansion for AI spending. IRAS is publishing detailed guidelines by mid-2026. We will keep you updated once confirmed."
- Keep responses concise (under 400 characters for Telegram)
- Always suggest next steps

Format response as JSON:
{
    "response": "Your response to the user",
    "should_escalate": false,
    "escalation_reason": ""
}`;

async function sendTelegramMessage(chatId: string, text: string, options: any = {}) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    };
    
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    console.log('Telegram message sent:', data.ok);
    return data;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    // Retry without Markdown if parsing failed
    if (error instanceof Error && error.message.includes('parse')) {
      return fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.replace(/[*_`]/g, ''),
          ...options
        })
      });
    }
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
    console.log('Inline keyboard sent:', data.ok);
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

// Send WhatsApp message (for alerting Isaac)
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

// Send alert via IonicX Leads Bot
async function sendLeadsBotAlert(chatId: string | number, text: string) {
  const url = `${LEADS_BOT_API}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };
  
  console.log('Sending Leads Bot alert to:', url);
  console.log('Payload:', JSON.stringify(payload));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Leads Bot HTTP error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
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

async function getAIResponse(message: string): Promise<{ response: string; should_escalate: boolean; escalation_reason: string }> {
  // Handle human escalation locally
  if (isHumanEscalation(message)) {
    return {
      response: "Sure! Here's how to reach Isaac directly:\n\n📧 isaac@isaacyap.ai\n📱 WhatsApp: +65 8026 8821\n\nHe typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).",
      should_escalate: true,
      escalation_reason: "User requested human agent"
    };
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || "";

    try {
      // Clean and parse JSON response
      let cleaned = textContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      
      const parsed = JSON.parse(cleaned);
      return {
        response: parsed.response || "I'm here to help! Ask me about IonicX services.",
        should_escalate: parsed.should_escalate || false,
        escalation_reason: parsed.escalation_reason || ""
      };
    } catch (parseError) {
      // Fallback: return raw text
      return {
        response: textContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || "I'm here to help! Ask me about IonicX services, pricing, or how AI can transform your business.",
        should_escalate: false,
        escalation_reason: ""
      };
    }
  } catch (error) {
    console.error("AI response error:", error);
    return {
      response: "Sorry, I'm having trouble processing your request. Please try again or contact Isaac directly at isaac@isaacyap.ai",
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

_Every business is different. We also build custom AI solutions tailored to your specific workflow. Tap "Talk to Isaac" to discuss._`,

  menu_pricing: `💰 *IonicX AI Pricing:*

*Starter — S$2,888 + S$888/year*
• 5-page website + basic chatbot

*Growth — S$5,888 + S$1,288/year*
• 10-page website + advanced AI

*Scale — S$8,888 + S$1,588/year*
• Custom web app + full automation

*Enterprise — S$15,888 + S$2,388/year*
• Bespoke AI solutions

_Need something outside these tiers? We do custom builds too — tap "Talk to Isaac" to chat._`,

  menu_demos: `🎯 *See Our Work:*

• Fab The Stretch Lad
  https://fabthestretchlad.vercel.app

• TattByLyds
  https://tattbylyds.vercel.app

Want a custom demo for your business? Let's talk!`,

  menu_contact: `📞 *Contact IonicX AI*

*Isaac Yap*
📧 isaac@isaacyap.ai
🌐 https://ionicx.ai
📱 WhatsApp: +65 8026 8821

*Office Hours:*
Mon-Fri: 9am - 6pm SGT`,

  btn_human: `Sure! Here's how to reach Isaac directly:

📧 isaac@isaacyap.ai
📱 WhatsApp: +65 8026 8821

He typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).`,

  btn_menu: `👋 Hello! I'm the IonicX AI Assistant.

I can help you with:
🚀 Our Services
💰 Pricing Plans
🎯 See Our Work
📞 Contact Us

Tap the button below to browse, or just tell me about your business needs!`
};

export async function POST(req: Request) {
  try {
    const update = await req.json();
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = query.message.chat.id.toString();
      const data = query.data;
      
      console.log(`Telegram callback from ${chatId}: ${data}`);
      
      // Answer the callback query
      await answerCallbackQuery(query.id);
      
      // Handle "Talk to Isaac" button - trigger alerts immediately
      if (data === 'btn_human') {
        console.log('Processing btn_human click...');
        
        try {
          const responseText = menuResponses['btn_human'];
          await sendInlineKeyboard(chatId, responseText, mainMenuKeyboard);
          console.log('Inline keyboard sent to user');
        } catch (error) {
          console.error('Failed to send inline keyboard:', error);
        }
        
        // Get user info for the alert
        const user = update.callback_query.from;
        const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
        const userHandle = user.username ? `@${user.username}` : 'No username';
        
        // Send alert via Leads Bot to Isaac
        const alertText = `🚨 *Lead Alert: Talk to Isaac*

*User:* ${userName}
*Username:* ${userHandle}
*Chat ID:* ${chatId}
*Action:* Clicked "Talk to Isaac" button

Reply: https://t.me/IonicXAI_Assistant`;
        
        console.log('Sending Leads Bot alert to Isaac...');
        try {
          await sendLeadsBotAlert(ISAAC_CHAT_ID, alertText);
          console.log('Leads Bot alert sent successfully');
        } catch (error) {
          console.error('Leads Bot alert failed:', error);
          // Fallback to main bot
          try {
            await sendTelegramMessage(ISAAC_CHAT_ID.toString(), alertText);
            console.log('Fallback alert sent via main bot');
          } catch (fallbackError) {
            console.error('Fallback alert also failed:', fallbackError);
          }
        }
        
        // Send WhatsApp alert to Isaac (skip if WhatsApp API not configured)
        if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
          try {
            const whatsAppAlert = `🚨 Lead Alert: Talk to Isaac

User: ${userName}
Username: ${userHandle}
Chat ID: ${chatId}
Action: Clicked "Talk to Isaac" button

Reply on Telegram: https://t.me/IonicXAI_Assistant`;
            await sendWhatsAppMessage(ISAAC_WHATSAPP, whatsAppAlert);
            console.log('WhatsApp alert sent successfully');
          } catch (error) {
            console.error('WhatsApp alert failed:', error);
          }
        } else {
          console.log('WhatsApp alerts skipped: API not configured');
        }
        
        console.log(`Alerts sent to Isaac for chat ${chatId} (Talk to Isaac button)`);
        return new Response('OK', { status: 200 });
      }
      
      // Send response based on button clicked
      const responseText = menuResponses[data] || menuResponses['btn_menu'];
      await sendInlineKeyboard(chatId, responseText, mainMenuKeyboard);
      
      return new Response('OK', { status: 200 });
    }
    
    // Handle regular messages
    if (update.message) {
      const message = update.message;
      const chatId = message.chat.id.toString();
      const messageText = message.text || '';
      
      console.log(`Telegram message from ${chatId}: ${messageText}`);
      
      // Handle /start and /menu commands
      if (messageText === '/start' || messageText === '/menu') {
        const welcomeText = `👋 Hi, I'm Robin — IonicX AI's assistant.

I'm here to help you explore how AI can automate your business. Whether it's a smart chatbot, a professional website, or full workflow automation — let's see what's possible.

What brings you here today?`;
        await sendInlineKeyboard(chatId, welcomeText, mainMenuKeyboard);
        return new Response('OK', { status: 200 });
      }
      
      // Get AI response
      const aiResponse = await getAIResponse(messageText);
      
      // Send AI response with menu keyboard
      await sendInlineKeyboard(chatId, aiResponse.response, mainMenuKeyboard);
      
      // Smart handoff: if escalation needed, alert Isaac via Leads Bot and WhatsApp
      if (aiResponse.should_escalate) {
        const alertText = `🚨 *Lead Alert from Telegram Bot*

*Chat ID:* ${chatId}
*Message:* ${messageText}
*Reason:* ${aiResponse.escalation_reason}

Reply to user: https://t.me/IonicXAI_Assistant`;
        
        // Send Leads Bot alert
        try {
          await sendLeadsBotAlert(ISAAC_CHAT_ID, alertText);
          console.log('Leads Bot alert sent');
        } catch (error) {
          console.error('Leads Bot alert failed, falling back to main bot:', error);
          await sendTelegramMessage(ISAAC_CHAT_ID.toString(), alertText);
        }
        
        // Send WhatsApp alert
        if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
          try {
            const whatsAppAlert = `🚨 Lead Alert from Telegram Bot

Chat ID: ${chatId}
Message: "${messageText}"
Reason: ${aiResponse.escalation_reason}

Reply on Telegram: https://t.me/IonicXAI_Assistant`;
            await sendWhatsAppMessage(ISAAC_WHATSAPP, whatsAppAlert);
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
    return new Response('Error', { status: 200 }); // Always return 200 to Telegram
  }
}

// GET handler for webhook verification (optional)
export async function GET(req: Request) {
  return new Response(JSON.stringify({
    status: 'Telegram bot webhook is active',
    bot: 'Robin - IonicX AI Sales Assistant',
    version: '1.2.0',
    alerts: 'Leads Bot enabled'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
