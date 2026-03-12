// Updated by Bruce test
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Telegram Bot API
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// WhatsApp API helper
const WA_API = () => `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
const WA_HEADERS = () => ({
  'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
});

// IonicX AI Knowledge Base
const knowledgeBase = {
  services: `🚀 *IonicX AI* builds AI-powered websites and WhatsApp chatbots for Singapore SMEs.

We help businesses:
✅ Automate customer enquiries 24/7
✅ Capture leads from WhatsApp and web
✅ Build professional websites that convert

*Our Services:*
• AI Chatbots (WhatsApp/Web)
• Professional Business Websites
• Lead Generation Systems
• Workflow Automation`,

  pricing: `💰 *IonicX AI Pricing:*

*Starter — S$2,888 setup + S$888/year*
• 5-page professional website
• Basic WhatsApp chatbot
• Mobile responsive design

*Growth — S$5,888 setup + S$1,288/year*
• 10-page website with CMS
• Advanced AI chatbot
• Lead capture & CRM integration
• SEO optimization

*Scale — S$8,888 setup + S$1,588/year*
• Custom web application
• Full AI automation suite
• WhatsApp Business API integration
• Priority support

*Enterprise — S$15,888 setup + S$2,388/year*
• Bespoke AI solutions
• Dedicated account manager
• Custom integrations & API access
• SLA-backed support & maintenance`,

  demos: `🎯 *See Our Work:*

*Portfolio Demos:*
• Fab The Stretch Lad
  https://fabthestretchlad.vercel.app

• TattByLyds
  https://tattbylyds.vercel.app

*Live Chatbot Demo:*
Message this number to test our AI chatbot!

Want a custom demo for your business? Let's talk.`,

  contact: `📞 *Contact IonicX AI*

*Isaac Yap*
📧 isaac@ionicx.ai
🌐 https://ionicx.ai
📱 WhatsApp: +65 8026 8821

*Office Hours:*
Mon-Fri: 9am - 6pm SGT

Ready to automate your business? Send me a message!`,

  human: `Sure! Here's how to reach Isaac directly:

📧 isaac@ionicx.ai
📱 WhatsApp: +65 8026 8821

He typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).`,

  fallback: `Thanks for reaching out! 😊

IonicX AI helps Singapore SMEs grow with AI-powered websites, WhatsApp chatbots, and automation tools. We make it easy for small businesses to look professional and capture more leads — all without the enterprise price tag.

Feel free to ask me about our services, pricing, or portfolio — or type *menu* to see all options!`,

  menu: `👋 Hello! I'm the IonicX AI Assistant.

I can help you with:
🚀 Our Services
💰 Pricing Plans
🎯 See Our Work
📞 Contact Us

Tap the button below to browse, or just tell me about your business needs!`
};

// Keyword matching for responses
function generateResponse(message) {
  const lowerMsg = message.toLowerCase().trim();

  // Human escalation
  const humanKeywords = ['human', 'agent', 'real person', 'talk to someone', 'speak to someone',
    'i want human support', 'get me isaac', 'isaac', 'real human', 'live agent', 'operator',
    'talk to a person', 'speak to a person', 'customer service', 'support agent'];
  if (humanKeywords.some(kw => lowerMsg.includes(kw))) {
    return { text: knowledgeBase.human, type: 'human' };
  }

  // Menu / greeting triggers
  if (['menu', 'help', 'start', 'hi', 'hello', 'hey'].includes(lowerMsg)) {
    return { text: knowledgeBase.menu, type: 'menu' };
  }

  if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('how much') || lowerMsg.includes('pricing')) {
    return { text: knowledgeBase.pricing, type: 'info' };
  }

  if (lowerMsg.includes('service') || lowerMsg.includes('what do you') || lowerMsg.includes('what can')) {
    return { text: knowledgeBase.services, type: 'info' };
  }

  if (lowerMsg.includes('demo') || lowerMsg.includes('portfolio') || lowerMsg.includes('example') || lowerMsg.includes('work')) {
    return { text: knowledgeBase.demos, type: 'info' };
  }

  if (lowerMsg.includes('contact') || lowerMsg.includes('email') || lowerMsg.includes('phone') || lowerMsg.includes('call') || lowerMsg.includes('reach')) {
    return { text: knowledgeBase.contact, type: 'info' };
  }

  // Default fallback — conversational, not the menu
  return { text: knowledgeBase.fallback, type: 'fallback' };
}

// Send a plain text message
async function sendTextMessage(to, text) {
  try {
    const response = await axios.post(WA_API(), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text }
    }, { headers: WA_HEADERS() });
    console.log('Text message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending text:', error.response?.data || error.message);
    throw error;
  }
}

// Send WhatsApp interactive list message (main menu)
async function sendInteractiveList(to) {
  try {
    const response = await axios.post(WA_API(), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'IonicX AI' },
        body: { text: knowledgeBase.menu },
        footer: { text: 'Tap below to explore' },
        action: {
          button: 'Browse Options',
          sections: [{
            title: 'What can I help with?',
            rows: [
              { id: 'menu_services', title: '🚀 Our Services', description: 'AI websites, chatbots & automation' },
              { id: 'menu_pricing', title: '💰 Pricing Plans', description: 'Starter, Growth, Scale & Enterprise' },
              { id: 'menu_demos', title: '🎯 See Our Work', description: 'Portfolio demos & live examples' },
              { id: 'menu_contact', title: '📞 Contact Us', description: 'Reach Isaac directly' }
            ]
          }]
        }
      }
    }, { headers: WA_HEADERS() });
    console.log('Interactive list sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending list:', error.response?.data || error.message);
    throw error;
  }
}

// Send reply buttons after a response ("Back to Menu" + "Talk to Isaac")
async function sendReplyButtons(to, bodyText) {
  try {
    const response = await axios.post(WA_API(), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'btn_menu', title: '📋 Back to Menu' } },
            { type: 'reply', reply: { id: 'btn_human', title: '👤 Talk to Isaac' } }
          ]
        }
      }
    }, { headers: WA_HEADERS() });
    console.log('Reply buttons sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending buttons:', error.response?.data || error.message);
    throw error;
  }
}

// Handle interactive message selections (button clicks / list picks)
function handleInteractiveMessage(message) {
  const interactive = message.interactive;
  if (interactive.type === 'button_reply') {
    const id = interactive.button_reply.id;
    if (id === 'btn_menu') return { text: knowledgeBase.menu, type: 'menu' };
    if (id === 'btn_human') return { text: knowledgeBase.human, type: 'human' };
  }
  if (interactive.type === 'list_reply') {
    const id = interactive.list_reply.id;
    if (id === 'menu_services') return { text: knowledgeBase.services, type: 'info' };
    if (id === 'menu_pricing') return { text: knowledgeBase.pricing, type: 'info' };
    if (id === 'menu_demos') return { text: knowledgeBase.demos, type: 'info' };
    if (id === 'menu_contact') return { text: knowledgeBase.contact, type: 'info' };
  }
  return { text: knowledgeBase.fallback, type: 'fallback' };
}

// Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook for incoming messages (POST)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (value?.messages) {
        const message = value.messages[0];
        const from = message.from;

        let result;

        // Handle interactive replies (button / list selections)
        if (message.type === 'interactive') {
          result = handleInteractiveMessage(message);
        } else {
          // Handle text messages
          const msgBody = message.text?.body || '';
          console.log(`Received from ${from}: ${msgBody}`);
          result = generateResponse(msgBody);
        }

        // Send response based on type
        if (result.type === 'menu') {
          await sendInteractiveList(from);
        } else {
          // Send the text content first
          await sendTextMessage(from, result.text);
          // Then send follow-up reply buttons
          await sendReplyButtons(from, 'What would you like to do next?');
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(200); // Always return 200 to WhatsApp
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'IonicX AI Chatbot is running',
    timestamp: new Date().toISOString(),
    services: {
      whatsapp: 'active',
      telegram: 'active'
    },
    bot: 'Robin - IonicX AI Sales Assistant'
  });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Version endpoint
app.get('/version', (req, res) => {
  res.json({ 
    version: '1.1.0', 
    name: 'IonicX AI Bot (WhatsApp + Telegram)',
    telegram_bot: 'Robin - Sales Assistant'
  });
});

// Ping endpoint
app.get('/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

// Test endpoint (for development)
app.post('/test', (req, res) => {
  const { message } = req.body;
  const result = generateResponse(message);
  res.json({ message, reply: result.text, type: result.type });
});

// ============================================
// TELEGRAM BOT ROUTES (Robin - IonicX AI Sales Assistant)
// ============================================

// Send message to Telegram
async function sendTelegramMessage(chatId, text, options = {}) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...options
    };
    
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    console.log('Telegram message sent:', response.data.ok);
    return response.data;
  } catch (error) {
    console.error('Error sending Telegram message:', error.response?.data || error.message);
    // Retry without Markdown if parsing failed
    if (error.response?.data?.description?.includes('parse')) {
      return axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: text.replace(/[*_`]/g, ''),
        ...options
      });
    }
    throw error;
  }
}

// Send inline keyboard (menu buttons)
async function sendInlineKeyboard(chatId, text, buttons) {
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: buttons
      }
    });
    console.log('Inline keyboard sent:', response.data.ok);
    return response.data;
  } catch (error) {
    console.error('Error sending keyboard:', error.response?.data || error.message);
    throw error;
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
    { text: '📞 Contact', callback_data: 'menu_contact' }
  ],
  [
    { text: '👤 Talk to Isaac', callback_data: 'btn_human' }
  ]
];

// Handle callback queries (button clicks)
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  let responseText = '';
  let showMenu = false;
  
  switch (data) {
    case 'menu_services':
      responseText = knowledgeBase.services;
      showMenu = true;
      break;
    case 'menu_pricing':
      responseText = knowledgeBase.pricing;
      showMenu = true;
      break;
    case 'menu_demos':
      responseText = knowledgeBase.demos;
      showMenu = true;
      break;
    case 'menu_contact':
      responseText = knowledgeBase.contact;
      showMenu = true;
      break;
    case 'btn_human':
      responseText = knowledgeBase.human;
      showMenu = true;
      break;
    case 'btn_menu':
      responseText = knowledgeBase.menu;
      showMenu = true;
      break;
    default:
      responseText = knowledgeBase.fallback;
      showMenu = true;
  }
  
  // Answer the callback query (removes loading state)
  await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
    callback_query_id: query.id
  });
  
  // Send response
  if (showMenu) {
    await sendInlineKeyboard(chatId, responseText, mainMenuKeyboard);
  } else {
    await sendTelegramMessage(chatId, responseText);
  }
}

// Telegram webhook handler
app.post('/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return res.sendStatus(200);
    }
    
    // Handle regular messages
    if (update.message) {
      const chatId = update.message.chat.id;
      const messageText = update.message.text || '';
      
      console.log(`Telegram message from ${chatId}: ${messageText}`);
      
      // Generate response
      const result = generateResponse(messageText);
      
      // Send response with menu keyboard
      await sendInlineKeyboard(chatId, result.text, mainMenuKeyboard);
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Telegram webhook error:', error);
    res.sendStatus(200);
  }
});

// Set Telegram webhook
app.get('/set-telegram-webhook', async (req, res) => {
  try {
    const webhookUrl = `https://${req.get('host')}/telegram-webhook`;
    
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query']
    });
    
    res.json({
      success: response.data.ok,
      description: response.data.description,
      webhook_url: webhookUrl
    });
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

// Delete Telegram webhook
app.get('/delete-telegram-webhook', async (req, res) => {
  try {
    const response = await axios.post(`${TELEGRAM_API}/deleteWebhook`);
    res.json({
      success: response.data.ok,
      description: response.data.description
    });
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

// Get Telegram webhook info
app.get('/telegram-webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

// Get Telegram bot info
app.get('/telegram-bot-info', async (req, res) => {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getMe`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 IonicX AI Chatbot running on port ${PORT}`);
  console.log(`📱 WhatsApp Webhook: https://your-domain.com/webhook`);
  console.log(`🤖 Telegram Webhook: https://your-domain.com/telegram-webhook`);
});
