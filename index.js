const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log("🚀 Starting NexGen AI Bot Process...");

if (!process.env.GEMINI_API_KEY) {
    console.log("❌ ERROR: GEMINI_API_KEY नहीं मिली!");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const systemPrompt = `You are a friendly and expert sales assistant for a digital agency. Your job is to talk to clients on WhatsApp, answer their queries, tell them we make great websites and apps like Zomato, and close the deal. Reply concisely and professionally in Hinglish or English.`;

const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: systemPrompt });
const userChats = {};

async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // WhatsApp का लेटेस्ट वर्ज़न फेच करना (यही उस Connection Failure को रोकेगा)
        const { version } = await fetchLatestBaileysVersion();
        console.log(`🌐 Using WhatsApp Version: ${version.join('.')}`);

        const sock = makeWASocket({
            version, 
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }), // फालतू लॉग्स हटा दिए ताकि QR साफ दिखे
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
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Connection Closed. Reason:', lastDisconnect.error?.message);
                
                // अगर कनेक्शन कटता है, तो 5 सेकंड बाद खुद दोबारा ट्राई करेगा
                if (shouldReconnect) {
                    console.log('🔄 Reconnecting in 5 seconds...');
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

            if (!userChats[sender]) {
                userChats[sender] = aiModel.startChat({ history: [] });
            }

            try {
                const response = await userChats[sender].sendMessage(text);
                await sock.sendMessage(sender, { text: response.response.text() });
            } catch (error) {
                console.log("🔥 AI Error:", error);
            }
        });

    } catch (err) {
        console.error("💥 CRITICAL CRASH ERROR:", err);
    }
}

startBot();
