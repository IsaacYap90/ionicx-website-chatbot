import { loadKnowledgeBase } from "@/app/lib/knowledge";
import crypto from "crypto";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Load knowledge base once at module level
const knowledgeBase = loadKnowledgeBase();

const HUMAN_ESCALATION_RESPONSE = {
  thinking: "User wants to speak with a human agent",
  response:
    "Sure! Here's how to reach Isaac directly:\n\n📧 isaac@isaacyap.ai\n📱 WhatsApp: +65 8026 8821\n\nHe typically responds within a few hours during business hours (Mon-Fri 9am-6pm SGT).",
  user_mood: "neutral",
  suggested_questions: [
    "What services does IonicX offer?",
    "How much does an AI chatbot cost?",
    "Can I book a free consultation?",
  ],
  debug: { context_used: false },
  redirect_to_agent: { should_redirect: false, reason: "" },
};

const HUMAN_KEYWORDS = [
  "human",
  "agent",
  "real person",
  "talk to a person",
  "speak to someone",
  "i want human support",
  "get me isaac",
  "contact isaac",
  "talk to isaac",
  "speak to a human",
  "live agent",
  "real human",
  "customer service",
  "speak to a person",
  "talk to someone",
  "human support",
  "live support",
  "connect me",
  "transfer me",
];

function isHumanEscalation(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return HUMAN_KEYWORDS.some(
    (keyword) => lower.includes(keyword)
  );
}

const systemPrompt = `You are IonicX AI Assistant — a friendly, professional sales and support agent for IonicX, a Singapore-based AI technology company. You help potential and existing customers learn about IonicX services, pricing, and how AI can transform their business.

You are bilingual. Respond in the same language the user writes in. If they write in Chinese (中文), reply in Chinese. If they write in English, reply in English. You can mix if appropriate.

Here is the IonicX knowledge base for reference:
${knowledgeBase}

Your responsibilities:
- Answer questions about IonicX services (AI chatbots, AI search, lead scoring, booking systems, e-commerce, AI websites)
- Explain pricing tiers clearly: Starter S$2,888 setup + S$888/yr / Growth S$5,888 setup + S$1,288/yr / Scale S$8,888 setup + S$1,588/yr / Enterprise S$15,888 setup + S$2,388/yr
- Encourage visitors to book a free consultation
- Be warm, helpful, and consultative — you're a trusted advisor, not a pushy salesman
- If you don't know something specific, offer to connect them with Isaac at isaac@isaacyap.ai or WhatsApp +65 8026 8821

Important guidelines:
- Keep responses concise but informative
- Use the knowledge base to give accurate answers
- Always suggest next steps (book a call, learn more about a service, etc.)
- For complex custom requirements, suggest a consultation call
- Do NOT proactively mention EIS, Enterprise Innovation Scheme, or any tax deduction schemes. If a user asks about EIS or tax deductions, respond ONLY with: "Budget 2026 announced the EIS expansion for AI spending. IRAS is publishing detailed guidelines by mid-2026. We will keep you updated once confirmed." Do NOT elaborate further.
- Do NOT use <think> tags or show internal reasoning. Just respond directly.
- When you receive an unrecognized or general message, give a helpful conversational response about IonicX services. Do NOT just repeat a menu. Only show the full menu of options if the user explicitly types "menu" or "help".
- If the user asks to speak to a human, agent, or real person, direct them to Isaac at isaac@isaacyap.ai or WhatsApp +65 8026 8821.

Format your entire response as a valid JSON object (no markdown wrapping, no code fences, just raw JSON):
{
    "thinking": "Brief explanation of your reasoning",
    "response": "Your response to the user (supports markdown)",
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

export async function POST(req: Request) {
  const { messages } = await req.json();
  const latestMessage = messages[messages.length - 1].content;

  console.log("📝 Latest Query:", latestMessage);

  // Handle human escalation locally — no API call needed
  if (isHumanEscalation(latestMessage)) {
    const responseWithId = {
      id: crypto.randomUUID(),
      ...HUMAN_ESCALATION_RESPONSE,
    };
    return new Response(JSON.stringify(responseWithId), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Build OpenAI-compatible messages
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
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
        max_tokens: 1000,
        temperature: 0.3,
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
      // Strip think tags, markdown code fences, and nested JSON wrappers
      let cleaned = textContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      // Handle nested code fences (model sometimes wraps JSON in ```json...```)
      const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      const parsed = JSON.parse(cleaned);
      // If model returned nested structure with "response" containing markdown JSON, extract inner
      if (typeof parsed.response === "string" && parsed.response.startsWith("```")) {
        const innerMatch = parsed.response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (innerMatch) {
          try {
            const inner = JSON.parse(innerMatch[1]);
            if (inner.response) {
              parsedResponse = inner;
            } else {
              parsedResponse = parsed;
            }
          } catch { parsedResponse = parsed; }
        } else {
          parsedResponse = parsed;
        }
      } else {
        parsedResponse = parsed;
      }
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError, "Raw:", textContent.substring(0, 200));
      // Fallback: return raw text as response
      const cleanText = textContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      parsedResponse = {
        thinking: "Response generated",
        response: cleanText || "I'm here to help! Ask me about IonicX services, pricing, or how AI can transform your business.",
        user_mood: "neutral",
        suggested_questions: ["What services does IonicX offer?", "How much does an AI chatbot cost?", "Can I book a free consultation?"],
        debug: { context_used: true },
        redirect_to_agent: { should_redirect: false, reason: "" },
      };
    }

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
    const errorResponse = {
      response: "Sorry, there was an issue processing your request. Please try again later.",
      thinking: "Error occurred during message generation.",
      user_mood: "neutral",
      suggested_questions: [],
      debug: { context_used: false },
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
