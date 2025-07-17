# 🎙️ Voice Bot – Gemini-Powered Real-Time AI Assistant

A real-time voice assistant powered by Google's Gemini API. Speak your query → let Gemini generate a response → and hear it back instantly. Built for the web with smooth voice input/output experience.

---

## 🚀 Features

- 🎤 Real-time microphone input
- 🔁 Gemini-powered natural language understanding
- 🗣️ Dynamic text-to-speech responses
- ⚡ Fast, interactive voice loop using browser APIs

---

## 🧠 Tech Stack

- TypeScript + Next.js
- Gemini Pro API (`@google/generative-ai`)
- Web Speech API (for voice input & output)
- Vite or Next.js (whichever applies)

---

## 📦 Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/yourusername/voice-bot.git
cd voice-bot
````

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Gemini API Key

Create a `.env.local` file in the root and add your Gemini API key:

```bash
GEMINI_API_KEY=your_google_gemini_api_key_here
```

> ⚠️ You can get your Gemini API key from: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### 4. Modify Prompt (Optional)

You can customize the system prompt in `index.ts`:

```ts
const SYSTEM_PROMPT = "You are a helpful assistant.";
```

Change this to modify the behavior/personality of your Voice Bot.

### 5. Run Locally

```bash
npm run dev
```

> Make sure your browser has microphone access enabled.

---

## ⚠️ Limitations

* Gemini free-tier users may experience **limited quota** for audio-related usage.
* Works best in **Chrome** and **Edge**; Safari and Firefox have partial Web Speech API support.

---

## 🚀 Deployment

This app is ready to deploy on any frontend hosting service like:

* [Vercel](https://vercel.com/)
* [Netlify](https://netlify.com/)
* Custom VPS/Static Hosting

---

## 🤝 Contributing

Pull requests and suggestions are welcome! Feel free to fork the repo and submit improvements.

---

## 📝 License

MIT © [Kartavya Master](https://github.com/kartavya1710)

