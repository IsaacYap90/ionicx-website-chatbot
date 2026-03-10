// Vercel Serverless Function for WhatsApp Webhook
// File: api/webhook.js

const axios = require('axios');

// IonicX AI Knowledge Base
const knowledgeBase = {
  services: `🚀 *IonicX AI* builds AI-powered websites and WhatsApp chatbots for Singapore SMEs.

We help businesses:
✅ Automate customer enquiries 24/7
✅ Capture leads from WhatsApp and web
✅ Build professional websites that convert
✅ Qualify for EIS 400% tax deduction

*Our Services:*
• AI Chatbots (WhatsApp/Web)
• Professional Business Websites  
• Lead Generation Systems
• Workflow Automation`,

  pricing: `💰 *IonicX AI Pricing:*

*Starter* — S$2,888
• 5-page professional website
• Basic WhatsApp chatbot
• Mobile responsive design

*Growth* — S$5,888  
• 10-page website with CMS
• Advanced AI chatbot
• Lead capture & CRM integration
• SEO optimization

*Enterprise* — S$8,888+
• Custom web application
• Full AI automation suite
• WhatsApp Business API integration
• Priority support & maintenance

*Annual Maintenance:* S$1,888/year`,

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
📱 WhatsApp Business

*Office Hours:*
Mon-Fri: 9am - 6pm SGT

Ready to automate your business? Send me a message!`,

  eis: `💡 *EIS 400% Tax Deduction*

Singapore's *Enterprise Innovation Scheme* lets SMEs claim:
• *400% tax deduction* on qualifying tech investments
• Up to S$400,000 qualifying expenditure per year
• Covers AI solutions, automation, digital tools

*Example:*
Spend S$10,000 on IonicX AI → Claim S$40,000 tax deduction

*Why it matters:*
Your AI investment pays for itself through tax savings.

IonicX AI solutions qualify for EIS. Let's discuss how.`,

  default: `👋 Hello! I'm the IonicX AI Assistant.

I can help you with:
• What we do — type *services*
• Pricing — type *pricing*  
• See our work — type *demos*
• Contact us — type *contact*
• EIS tax deduction — type *eis*

Or just tell me about your business needs!`
};

// Generate response based on message content
function generateResponse(message) {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('how much') || lowerMsg.includes('pricing')) {
    return knowledgeBase.pricing;
  }
  
  if (lowerMsg.includes('service') || lowerMsg.includes('do') || lowerMsg.includes('what') || lowerMsg.includes('help')) {
    return knowledgeBase.services;
  }
  
  if (lowerMsg.includes('demo') || lowerMsg.includes('portfolio') || lowerMsg.includes('example') || lowerMsg.includes('work')) {
    return knowledgeBase.demos;
  }
  
  if (lowerMsg.includes('contact') || lowerMsg.includes('email') || lowerMsg.includes('phone') || lowerMsg.includes('call') || lowerMsg.includes('reach')) {
    return knowledgeBase.contact;
  }
  
  if (lowerMsg.includes('eis') || lowerMsg.includes('tax') || lowerMsg.includes('deduction') || lowerMsg.includes('incentive')) {
    return knowledgeBase.eis;
  }
  
  if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
    return knowledgeBase.default;
  }
  
  return knowledgeBase.default;
}

// Send WhatsApp message via WhatsApp Business API
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Message sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    throw error;
  }
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
          const msgBody = message.text?.body || '';
          
          console.log(`Received from ${from}: ${msgBody}`);
          
          // Generate response
          const reply = generateResponse(msgBody);
          
          // Send reply
          try {
            await sendWhatsAppMessage(from, reply);
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
