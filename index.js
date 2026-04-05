const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { OpenAI } = require('openai'); // Google हट गया, OpenAI (OpenRouter) आ गया

const phoneNumber = "916375284235"; 

console.log("🚀 Starting NexGen AI Bot with OpenRouter...");

if (!process.env.OPENROUTER_API_KEY) {
    console.log("❌ ERROR: OPENROUTER_API_KEY नहीं मिली!");
}

// OpenRouter का सेटअप
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": "https://shubhamrawal.in", // आपका पोर्टफोलियो
        "X-Title": "NexGen Digital"
    }
});

const systemPrompt = `You are a friendly and expert sales assistant for a digital agency named NexGen Digital. Your job is to talk to clients on WhatsApp, answer their queries, tell them we make great websites and apps like Zomato, and close the deal. Reply concisely and professionally in Hinglish or English.`;

const userChats = {};

async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version, 
            auth: state,
            printQRInTerminal: false, 
            logger: pino({ level: 'silent' }), 
            browser: ["Ubuntu", "Chrome", "20.0.04"] 
        });

        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log('\n==================================================');
                    console.log(`🔑 YOUR PAIRING CODE IS: ${code}`);
                    console.log('==================================================\n');
                } catch (err) {
                    console.log("❌ Pairing Code Error:", err.message);
                }
            }, 3000);
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') console.log('✅ AI BOT IS ONLINE AND READY!');
            if (connection === 'close') {
                if ((lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(startBot, 5000); 
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            if (!text) return;

            // अगर यूजर पहली बार मैसेज कर रहा है, तो सिस्टम प्रॉम्प्ट सेट करें
            if (!userChats[sender]) {
                userChats[sender] = [
                    { role: "system", content: systemPrompt }
                ];
            }

            // यूजर का नया मैसेज हिस्ट्री में डालें
            userChats[sender].push({ role: "user", content: text });

            try {
                // OpenRouter से रिप्लाई जनरेट करवाएं
                const completion = await openai.chat.completions.create({
                    model: "meta-llama/llama-3-8b-instruct:free", // OpenRouter का फ्री मॉडल
                    messages: userChats[sender],
                });

                const reply = completion.choices[0].message.content;
                
                // AI का रिप्लाई हिस्ट्री में सेव करें ताकि उसे पिछली बातें याद रहें
                userChats[sender].push({ role: "assistant", content: reply });

                // WhatsApp पर मैसेज भेजें
                await sock.sendMessage(sender, { text: reply });
            } catch (error) {
                console.log("🔥 AI Error:", error.message);
            }
        });

    } catch (err) {
        console.error("💥 CRITICAL CRASH ERROR:", err);
    }
}

startBot();
