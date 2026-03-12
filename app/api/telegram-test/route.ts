// Simple test endpoint for Telegram bot
export async function POST(req: Request) {
  try {
    const update = await req.json();
    console.log('Received update:', JSON.stringify(update));
    
    // Simple test - just send an alert
    const LEADS_BOT_TOKEN = "8351114666:AAHCnEtNiRHSyjDBbZ-4y5G7axlBmCY8uk0";
    const ISAAC_CHAT_ID = 1729085064;
    
    const alertText = `🚨 *Test Alert*

Received update type: ${update.callback_query ? 'callback_query' : update.message ? 'message' : 'unknown'}

Time: ${new Date().toISOString()}`;
    
    const response = await fetch(`https://api.telegram.org/bot${LEADS_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ISAAC_CHAT_ID,
        text: alertText,
        parse_mode: 'Markdown'
      })
    });
    
    const data = await response.json();
    console.log('Alert response:', JSON.stringify(data));
    
    return new Response(JSON.stringify({ ok: true, alert_sent: data.ok }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function GET(req: Request) {
  return new Response(JSON.stringify({
    status: 'Test endpoint active',
    version: '1.0.0'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
