import fs from "fs";
import path from "path";

// ─── Constants ───────────────────────────────────────────────────────────────
const NOTIFICATION_NUMBER = "6580268821";
const WHATSAPP_API_VERSION = "v21.0";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

// ─── In-memory conversation store ────────────────────────────────────────────
// Tracks per-user: messages history and whether they've seen the menu
const conversations = new Map();

function getConversation(phoneNumber) {
  if (!conversations.has(phoneNumber)) {
    conversations.set(phoneNumber, { messages: [], menuShown: false });
  }
  return conversations.get(phoneNumber);
}

// ─── Knowledge base ──────────────────────────────────────────────────────────
function loadKnowledgeBase() {
  try {
    const knowledgeDir = path.join(process.cwd(), "knowledge");
    const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith(".md"));
    return files
      .map((file) => {
        const content = fs.readFileSync(path.join(knowledgeDir, file), "utf-8");
        return `--- ${file} ---\n${content}`;
      })
      .join("\n\n");
  } catch (e) {
    console.error("Failed to load knowledge base:", e);
    return "";
  }
}

const knowledgeBase = loadKnowledgeBase();

// ─── System prompt ───────────────────────────────────────────────────────────
const systemPrompt = `You are IonicX AI Assistant — a friendly, professional sales and support agent for IonicX, a Singapore-based AI technology company on WhatsApp.

You are bilingual. Respond in the same language the user writes in. If they write in Chinese (中文), reply in Chinese. If they write in English, reply in English.

Here is the IonicX knowledge base for reference:
${knowledgeBase}

Your responsibilities:
- Answer questions about IonicX services (AI chatbots, AI search, lead scoring, booking systems, e-commerce, AI websites)
- Explain pricing tiers clearly: Starter S$2,888 / Growth S$5,888 / Scale S$8,888 / Enterprise S$15,888
- Encourage visitors to book a free consultation
- Be warm, helpful, and consultative

CRITICAL RULES:
1. ONLY answer questions you can CONFIDENTLY answer using the knowledge base above.
2. If you are NOT confident in your answer, you MUST set "confident" to false in your JSON response. Do NOT guess or make up information.
3. If the question is completely unrelated to IonicX or business/AI services (e.g. weather, sports, random trivia), set "off_topic" to true.
4. Do NOT show a menu or list of services unless the user explicitly asks for "menu" or "help". Respond naturally and conversationally.
5. Keep responses concise — this is WhatsApp, not email.
6. Do NOT proactively mention EIS, Enterprise Innovation Scheme, or any tax deduction schemes. If a user asks about EIS or tax deductions, respond ONLY with: "Budget 2026 announced the EIS expansion for AI spending. IRAS is publishing detailed guidelines by mid-2026. We will keep you updated once confirmed." Do NOT elaborate further.
7. Do NOT use <think> tags or show internal reasoning.
8. If the user asks to speak to a human, set "wants_human" to true.

Format your entire response as valid JSON (no markdown, no code fences):
{
  "response": "Your WhatsApp reply text",
  "confident": true,
  "off_topic": false,
  "wants_human": false
}`;

// ─── WhatsApp API helpers ────────────────────────────────────────────────────
async function sendWhatsAppMessage(to, text, phoneNumberId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`WhatsApp send failed (to: ${to}):`, res.status, err);
  }
  return res;
}

// ─── AI response generation ─────────────────────────────────────────────────
async function generateAIResponse(userMessage, conversationHistory) {
  const apiKey = process.env.NVIDIA_NIM_KEY;
  if (!apiKey) {
    console.error("NVIDIA_NIM_KEY not set");
    return { response: "", confident: false, off_topic: false, wants_human: false };
  }

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-10), // Keep last 10 messages for context
    { role: "user", content: userMessage },
  ];

  const res = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "minimaxai/minimax-m2.1",
      messages: apiMessages,
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("NVIDIA API error:", res.status, errText);
    return { response: "", confident: false, off_topic: false, wants_human: false };
  }

  const data = await res.json();
  const textContent = data.choices?.[0]?.message?.content || "";

  try {
    let cleaned = textContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse AI response:", textContent.substring(0, 200));
    // If we can't parse, treat as not confident
    return { response: textContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(), confident: false, off_topic: false, wants_human: false };
  }
}

// ─── Human escalation keywords ──────────────────────────────────────────────
const HUMAN_KEYWORDS = [
  "human", "agent", "real person", "talk to a person", "speak to someone",
  "get me isaac", "contact isaac", "talk to isaac", "speak to a human",
  "live agent", "real human", "customer service", "speak to a person",
  "talk to someone", "human support", "live support", "connect me", "transfer me",
];

function isHumanEscalation(message) {
  const lower = message.toLowerCase().trim();
  return HUMAN_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Main webhook handler ────────────────────────────────────────────────────
export default async function handler(req, res) {
  // GET = webhook verification
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      console.log("✅ Webhook verified");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  // POST = incoming messages
  if (req.method === "POST") {
    const body = req.body;

    // Acknowledge immediately
    res.status(200).send("OK");

    try {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // Only process actual messages (not status updates)
      if (!value?.messages?.[0]) return;

      const message = value.messages[0];
      const from = message.from; // Sender's phone number
      const phoneNumberId = value.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
      const messageText = message.text?.body?.trim();

      if (!messageText) return; // Ignore non-text messages

      console.log(`📩 Message from ${from}: ${messageText}`);

      const conv = getConversation(from);

      // ── 1. Human escalation check ──
      if (isHumanEscalation(messageText)) {
        await sendWhatsAppMessage(
          from,
          "Sure! Let me connect you with Isaac.\n\n📧 isaac@ionicx.ai\n📱 WhatsApp: +65 8026 8821\n\nHe typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).",
          phoneNumberId
        );

        // Notify Isaac
        await sendWhatsAppMessage(
          NOTIFICATION_NUMBER,
          `🔔 NEW LEAD ALERT\nFrom: ${from}\nMessage: ${messageText}\nTime: ${new Date().toISOString()}\n\nReply to them on WhatsApp.`,
          phoneNumberId
        );
        return;
      }

      // ── 2. Generate AI response ──
      const aiResult = await generateAIResponse(messageText, conv.messages);

      // ── 3. Handle off-topic questions ──
      if (aiResult.off_topic) {
        await sendWhatsAppMessage(
          from,
          "I specialize in AI solutions for businesses. How can I help with your business needs?",
          phoneNumberId
        );
        conv.messages.push({ role: "user", content: messageText });
        conv.messages.push({ role: "assistant", content: "I specialize in AI solutions for businesses. How can I help with your business needs?" });
        return;
      }

      // ── 4. Handle wants_human flag from AI ──
      if (aiResult.wants_human) {
        await sendWhatsAppMessage(
          from,
          "Sure! Here's how to reach Isaac directly:\n\n📧 isaac@ionicx.ai\n📱 WhatsApp: +65 8026 8821\n\nHe typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).",
          phoneNumberId
        );

        await sendWhatsAppMessage(
          NOTIFICATION_NUMBER,
          `🔔 NEW LEAD ALERT\nFrom: ${from}\nMessage: ${messageText}\nTime: ${new Date().toISOString()}\n\nReply to them on WhatsApp.`,
          phoneNumberId
        );
        return;
      }

      // ── 5. HARD RULE: If AI is not confident, hand off to Isaac ──
      if (!aiResult.confident || !aiResult.response) {
        await sendWhatsAppMessage(
          from,
          "Great question! Let me connect you with our team for the best answer. Someone will get back to you shortly.",
          phoneNumberId
        );

        // Notify Isaac
        await sendWhatsAppMessage(
          NOTIFICATION_NUMBER,
          `🔔 NEW LEAD ALERT\nFrom: ${from}\nMessage: ${messageText}\nTime: ${new Date().toISOString()}\n\nReply to them on WhatsApp.`,
          phoneNumberId
        );
        return;
      }

      // ── 6. Confident response — send it ──
      await sendWhatsAppMessage(from, aiResult.response, phoneNumberId);

      // Track conversation history
      conv.messages.push({ role: "user", content: messageText });
      conv.messages.push({ role: "assistant", content: aiResult.response });

      // Mark menu as shown if response contained menu-like content
      if (aiResult.response.includes("1.") && aiResult.response.includes("2.") && aiResult.response.includes("3.")) {
        conv.menuShown = true;
      }

    } catch (err) {
      console.error("❌ Webhook processing error:", err);
    }

    return;
  }

  return res.status(405).send("Method Not Allowed");
}
