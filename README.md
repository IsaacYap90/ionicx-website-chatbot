# IonicX AI WhatsApp Chatbot

AI-powered WhatsApp Business API chatbot for IonicX AI — built to demonstrate conversational AI capabilities to clients like EcoSwift.

## Features

- 🤖 **AI Responses** — Keyword-based intelligent replies
- 💬 **WhatsApp Integration** — Native WhatsApp Business API
- 📱 **24/7 Availability** — Automated customer engagement
- 🚀 **Easy Deployment** — Ready for Vercel, Railway, or any Node.js host

## Knowledge Base Topics

| Query | Response |
|-------|----------|
| Services | What IonicX AI does (websites, chatbots, automation) |
| Pricing | Starter S$2,888 / Growth S$5,888 / Enterprise S$8,888+ |
| Demos | Portfolio links (Fab The Stretch Lad, TattByLyds) |
| Contact | Isaac Yap contact details |
| EIS Tax | 400% tax deduction explanation for Singapore SMEs |

## Setup

### 1. Clone & Install

```bash
git clone <repo-url>
cd ionicx-chatbot
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:
- `WHATSAPP_ACCESS_TOKEN` — From Meta Developer Console
- `WHATSAPP_PHONE_NUMBER_ID` — Your WhatsApp Business phone number ID
- `VERIFY_TOKEN` — Custom token for webhook verification

### 3. Meta/WhatsApp Setup

1. Create app at [developers.facebook.com](https://developers.facebook.com)
2. Add WhatsApp product
3. Get Access Token and Phone Number ID
4. Configure webhook URL: `https://your-domain.com/webhook`
5. Subscribe to `messages` webhook events

### 4. Run Locally

```bash
npm run dev
```

### 5. Deploy

**Vercel:**
```bash
npm i -g vercel
vercel
```

**Railway:**
```bash
npm i -g railway
railway login
railway up
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/webhook` | GET | WhatsApp verification |
| `/webhook` | POST | Receive messages |
| `/test` | POST | Test chatbot responses |

## Test the Bot

```bash
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"message": "How much does it cost?"}'
```

## Demo Flow for Clients

1. **Show the chatbot** — "I built this AI chatbot for my own business"
2. **Live test** — Send WhatsApp message, get instant reply
3. **The pivot** — "Now imagine this answering YOUR EV questions"
4. **Close** — "Same tech, your data. Let's build SWIFT for EcoSwift"

## Customization for EcoSwift

To adapt this for EcoSwift (SWIFT system):

1. Update `knowledgeBase` in `src/index.js` with:
   - FR601 specs
   - EV490 specs  
   - Battery swap process
   - Charging infrastructure details

2. Add lead capture logic:
   - Detect buying intent
   - Capture customer details
   - Route to sales team

3. Add service reminder triggers:
   - Mileage-based scheduling
   - Automated follow-ups

## License

ISC

## Built By

Isaac Yap | IonicX AI | https://ionicx.ai
