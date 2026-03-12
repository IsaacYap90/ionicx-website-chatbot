// Minimal Telegram Bot API Route - only handles btn_human
export async function POST(req: Request) {
  try {
    const update = await req.json();
    
    // Only handle callback queries
    if (!update.callback_query) {
      return new Response('OK', { status: 200 });
    }
    
    const query = update.callback_query;
    const data = query.data;
    
    // Only handle btn_human
    if (data !== 'btn_human') {
      return new Response('OK', { status: 200 });
    }
    
    const chatId = query.message.chat.id.toString();
    const user = query.from;
    const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    const userHandle = user.username ? `@${user.username}` : 'No username';
    
    // Send response to user
    const responseText = `Sure! Here's how to reach Isaac directly:

📧 isaac@isaacyap.ai
📱 WhatsApp: +65 8026 8821

He typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).`;
    
    // Send message to user via main bot
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: responseText,
        parse_mode: 'Markdown'
      })
    });
    
    // Send alert to Isaac via Leads Bot
    const alertText = `🚨 *Lead Alert: Talk to Isaac*

*User:* ${userName}
*Username:* ${userHandle}
*Chat ID:* ${chatId}
*Action:* Clicked "Talk to Isaac" button

Reply: https://t.me/IonicXAI_Assistant`;
    
    const LEADS_BOT_TOKEN = "LEADS_BOT_TOKEN_REDACTED";
    const ISAAC_CHAT_ID = 1729085064;
    
    await fetch(`https://api.telegram.org/bot${LEADS_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ISAAC_CHAT_ID,
        text: alertText,
        parse_mode: 'Markdown'
      })
    });
    
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Error:', error);
    return new Response('Error', { status: 200 });
  }
}

export async function GET(req: Request) {
  return new Response(JSON.stringify({
    status: 'Minimal Telegram bot webhook is active',
    version: '2.0.0'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
