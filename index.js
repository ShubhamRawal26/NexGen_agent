const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log("🚀 Starting NexGen AI Bot Process...");

// API Key चेक करना
if (!process.env.GEMINI_API_KEY) {
    console.log("❌ ERROR: GEMINI_API_KEY नहीं मिली! GitHub Secrets चेक करें।");
} else {
    console.log("✅ API Key Loaded Successfully!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const systemPrompt = `You are a friendly and expert sales assistant for a digital agency. 
Your job is to talk to clients on WhatsApp, answer their queries, tell them we make great websites and apps like Zomato, and close the deal. 
Reply concisely and professionally in Hinglish or English.`;

const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt
});

const userChats = {};

async function startBot() {
    try {
        console.log("📂 Setting up Auth Data...");
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'info' }), // यहाँ हमने silent को info कर दिया है ताकि हर गतिविधि दिखे
            browser: ["NexGen AI", "Chrome", "1"]
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            if (qr) {
                console.log('\n==================================================');
                console.log('=== 👇 SCAN THIS QR CODE WITH WHATSAPP 👇 ===');
                console.log('==================================================\n');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'open') {
                console.log('✅ AI BOT IS ONLINE AND READY!');
            }
            
            if (connection === 'close') {
                console.log('❌ Connection Closed. Reason:', lastDisconnect?.error);
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

            const sender = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            if (!text) return;

            console.log(`📩 New Message from ${sender}: ${text}`);

            if (!userChats[sender]) {
                userChats[sender] = aiModel.startChat({ history: [] });
            }

            try {
                const response = await userChats[sender].sendMessage(text);
                await sock.sendMessage(sender, { text: response.response.text() });
            } catch (error) {
                console.log("🔥 AI Request Error:", error);
            }
        });

    } catch (err) {
        console.error("💥 CRITICAL CRASH ERROR:", err);
    }
}

startBot();
