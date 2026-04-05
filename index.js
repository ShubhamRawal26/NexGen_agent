const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { OpenAI } = require('openai');

const phoneNumber = "916375284235"; 

console.log("🚀 Starting NexGen AI Bot with OpenRouter...");

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
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

            if (!userChats[sender]) {
                userChats[sender] = [{ role: "system", content: systemPrompt }];
            }

            userChats[sender].push({ role: "user", content: text });

            try {
                const completion = await openai.chat.completions.create({
                    // 🌟 UPDATED MODEL ID HERE 🌟
                    model: "meta-llama/llama-3.1-8b-instruct:free", 
                    messages: userChats[sender],
                });

                const reply = completion.choices[0].message.content;
                userChats[sender].push({ role: "assistant", content: reply });
                await sock.sendMessage(sender, { text: reply });
            } catch (error) {
                console.log("🔥 AI Error:", error.message);
                // अगर फिर भी मॉडल एरर आए, तो इस बैकअप मॉडल को ट्राई करेगा
                if(error.message.includes('404')) {
                    console.log("🔄 Trying Backup Model...");
                    const backupCompletion = await openai.chat.completions.create({
                        model: "mistralai/mistral-7b-instruct:free",
                        messages: userChats[sender],
                    });
                    const backupReply = backupCompletion.choices[0].message.content;
                    await sock.sendMessage(sender, { text: backupReply });
                }
            }
        });

    } catch (err) {
        console.error("💥 CRITICAL CRASH ERROR:", err);
    }
}

startBot();
