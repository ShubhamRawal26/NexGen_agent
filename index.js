const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// 🌟 SECURE FIREBASE URL FROM GITHUB SECRETS 🌟
const FIREBASE_URL = process.env.FIREBASE_URL;

const prdStates = {}; 

// Function to fetch dynamic packages/services from your Admin Panel (अगर भविष्य में जरूरत पड़े)
async function getServicesFromCRM() {
    try {
        const response = await fetch(`${FIREBASE_URL}/services.json`);
        const data = await response.json();
        if (!data) return [];
        
        return Object.keys(data).map(key => ({
            id: key,
            name: data[key].name,
            price: data[key].price,
            description: data[key].description
        }));
    } catch (error) {
        console.error("Failed to fetch services:", error);
        return [];
    }
}

async function startBot() {
    if (!FIREBASE_URL) {
        console.log("❌ ERROR: FIREBASE_URL is missing in GitHub Secrets!");
        process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["NexGen Digital", "Agency", "1"] 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.clear(); 
            console.log('\n==================================================');
            console.log('⚠️ QR CODE TOO BIG? CLICK "View raw logs" in top right!');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true }); 
        }

        if (connection === 'open') console.log('✅ NEXGEN DIGITAL BOT IS ONLINE! learn more, Earn more.');
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) startBot();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
        if (msg.key.fromMe) return; // Loop Protection

        const sender = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();

        console.log(`📩 Lead Query: ${text}`);

        // --- 🌟 STEP 2: PRD MULTI-STEP COLLECTION FLOW ---
        // यह सिस्टम क्लाइंट से एक-एक करके 3 सवाल पूछेगा
        if (prdStates[sender]) {
            const currentState = prdStates[sender];
            
            if (currentState.step === 'WAITING_BUSINESS_INFO') {
                currentState.data.businessInfo = text;
                currentState.step = 'WAITING_GOAL';
                await sock.sendMessage(sender, { text: `*सवाल 2/3:* आप अपनी वेबसाइट/ऐप से मुख्य रूप से क्या चाहते हैं?\n(उदा: ऑनलाइन बुकिंग, लीड जनरेशन, या सिर्फ जानकारी देना)` });
                return;
            }
            
            if (currentState.step === 'WAITING_GOAL') {
                currentState.data.primaryGoal = text;
                currentState.step = 'WAITING_REFERENCE';
                await sock.sendMessage(sender, { text: `*सवाल 3/3:* क्या आपके पास कोई रेफरेंस वेबसाइट है जिसकी तरह आप अपनी साइट बनाना चाहते हैं?\n(यदि नहीं, तो 'No' लिखें)` });
                return;
            }

            if (currentState.step === 'WAITING_REFERENCE') {
                currentState.data.reference = text;
                const customerWaNumber = sender.split('@')[0];

                // Match NexGen CRM Structure (The Command Center)
                const nexGenLead = {
                    clientId: "wa_" + customerWaNumber,
                    phone: customerWaNumber,
                    businessInfo: currentState.data.businessInfo,
                    primaryGoal: currentState.data.primaryGoal,
                    referenceSite: currentState.data.reference,
                    status: "Fresh Lead",
                    source: "WhatsApp Auto-Bot",
                    timestamp: new Date().toISOString()
                };

                // Save lead securely via REST API to Firebase CRM
                try {
                    await fetch(`${FIREBASE_URL}/leads.json`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(nexGenLead)
                    });
                } catch (error) {
                    console.log("Firebase Error: ", error);
                }

                await sock.sendMessage(sender, { text: `✅ *Thank You!* आपकी Project Requirements (PRD) सफलतापूर्वक सबमिट हो गई है।\n\nहमारी NexGen टीम जल्द ही आपके प्रोजेक्ट को एनालाइज़ करके आपसे संपर्क करेगी। 🚀` });
                delete prdStates[sender]; 
                return;
            }
        }

        // --- 🌟 STEP 1: MENU & TRIGGERS (Decoy & Anchor Strategy) ---
        if (text === 'hi' || text === 'hello' || text === 'hey' || text === 'menu') {
            const menuMessage = `🚀 *Welcome to NexGen Digital!* \nWe build next-gen websites & apps to grow your local business on autopilot.\n\nकृपया नीचे दिए गए विकल्पों में से चुनें (1-4 टाइप करें):\n\n1️⃣ *Smart Website Plans*\n2️⃣ *Custom Mobile App Plans*\n3️⃣ *Our Portfolio*\n4️⃣ *Start a Project (Submit PRD)*`;
            await sock.sendMessage(sender, { text: menuMessage });
        } 
        else if (text === '1') {
            const webPlans = `🌐 *Smart Website Packages:*\n\n` +
                             `🔹 *Basic (Starter) - ₹2,999*\nStandard Design, Direct WhatsApp Leads.\n\n` +
                             `⭐ *Standard (VIP) - ₹4,999 [MOST POPULAR]*\nPremium Design, Custom Domain (.in/.com), Fast Server.\n\n` +
                             `💎 *Premium - ₹7,999*\nOnline Payment Gateway, Auto-SMS/Email.\n\n` +
                             `*प्रोजेक्ट शुरू करने के लिए 4 टाइप करें!*`;
            await sock.sendMessage(sender, { text: webPlans });
        }
        else if (text === '2') {
            const appPlans = `📱 *Custom Mobile App Packages:*\n\n` +
                             `🔹 *Basic (Lite) - ₹4,999*\nWebsite-to-App, Basic Notifications.\n\n` +
                             `⭐ *Standard (Pro) - ₹6,999 [BEST VALUE]*\nNative Android App, Play Store Live.\n\n` +
                             `💎 *Premium - ₹8,999*\nAndroid + iOS App, Advanced Analytics.\n\n` +
                             `*प्रोजेक्ट शुरू करने के लिए 4 टाइप करें!*`;
            await sock.sendMessage(sender, { text: appPlans });
        }
        else if (text === '3') {
            await sock.sendMessage(sender, { text: `🔥 हमारे लाइव प्रोजेक्ट्स और पोर्टफोलियो यहाँ देखें: https://shubhamrawal.in` });
        }
        else if (text === '4') {
            prdStates[sender] = { step: 'WAITING_BUSINESS_INFO', data: {} };
            await sock.sendMessage(sender, { text: `शानदार! 🚀 चलिए आपका प्रोजेक्ट शुरू करते हैं।\n\n*सवाल 1/3:* आपके बिज़नेस का नाम और इंडस्ट्री क्या है?\n(उदा: Royal Gym, Fitness Clinic)` });
        }
        else if (text.includes("contact") || text.includes("call")) {
            await sock.sendMessage(sender, { text: "📞 *Contact NexGen Digital:* \n\n- *Website:* https://shubhamrawal.in" });
        }
        else {
            await sock.sendMessage(sender, { text: "🤔 I didn't quite catch that.\n\nType *menu* to see our services, or type *4* to start a project!" });
        }
    });
}

startBot().catch(err => console.log("Error: " + err));
