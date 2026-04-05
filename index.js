const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// GitHub Secrets से API Key लेना
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// यहाँ आप अपनी कंपनी की जानकारी लिख सकते हैं
const systemPrompt = `You are a friendly and expert sales assistant for a digital agency. 
Your job is to talk to clients on WhatsApp, answer their queries, tell them we make great websites and apps like Zomato, and close the deal. 
Reply concisely and professionally in Hinglish or English.`;

const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt
});

const userChats = {};

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["AI Bot", "Chrome", "1"]
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log('\n=== SCAN THIS QR CODE WITH WHATSAPP ===\n');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') console.log('✅ AI BOT IS ONLINE!');
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
            console.log("AI Error:", error);
        }
    });
}

startBot();
