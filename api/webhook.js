// Vercel Serverless Function for WhatsApp Webhook
// File: api/webhook.js

const axios = require('axios');

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
📧 isaac@isaacyap.ai
🌐 https://ionicx.ai
📱 WhatsApp: +65 8026 8821

*Office Hours:*
Mon-Fri: 9am - 6pm SGT

Ready to automate your business? Send me a message!`,

  human: `Sure! Here's how to reach Isaac directly:

📧 isaac@isaacyap.ai
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

// Generate response based on message content
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

// Main handler
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Webhook verification (Meta)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook verification attempt:', { mode, token, challenge });

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      return res.status(200).send(challenge);
    } else {
      console.log('Webhook verification failed');
      return res.sendStatus(403);
    }
  }

  // POST - Receive WhatsApp messages
  if (req.method === 'POST') {
    try {
      const body = req.body;
      console.log('Received webhook:', JSON.stringify(body, null, 2));

      if (body.object === 'whatsapp_business_account') {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (value?.messages && value.messages.length > 0) {
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
          try {
            if (result.type === 'menu') {
              await sendInteractiveList(from);
            } else {
              // Send the text content first
              await sendTextMessage(from, result.text);
              // Then send follow-up reply buttons
              await sendReplyButtons(from, 'What would you like to do next?');
            }
            console.log('Reply sent successfully');
          } catch (sendError) {
            console.error('Failed to send reply:', sendError);
          }
        }
      }

      // Always return 200 to WhatsApp
      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(200).json({ status: 'error', message: error.message });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: 'Method not allowed' });
};
