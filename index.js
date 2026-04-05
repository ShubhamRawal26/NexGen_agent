const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 👇 आपका बॉट वाला नंबर यहाँ सेट कर दिया गया है
const phoneNumber = "916375284235"; 

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
        const { version } = await fetchLatestBaileysVersion();
        console.log(`🌐 Using WhatsApp Version: ${version.join('.')}`);

        const sock = makeWASocket({
            version, 
            auth: state,
            printQRInTerminal: false, 
            logger: pino({ level: 'silent' }), 
            browser: ["Ubuntu", "Chrome", "20.0.04"] 
        });

        // 🌟 PAIRING CODE LOGIC 🌟
        if (!sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log('\n==================================================');
                    console.log(`🔑 YOUR PAIRING CODE IS: ${code}`);
                    console.log('📱 WhatsApp खोलें > Linked Devices > "Link with phone number" पर क्लिक करें');
                    console.log('और यह 8-अक्षरों का कोड वहां डाल दें!');
                    console.log('==================================================\n');
                } catch (err) {
                    console.log("❌ Pairing Code Error:", err.message);
                }
            }, 3000);
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log('✅ AI BOT IS ONLINE AND READY!');
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Connection Closed. Reason:', lastDisconnect.error?.message);
                
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
