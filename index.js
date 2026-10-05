const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const qrImage = require('qr-image');

let latestQR = '';

// سيرفر ويب يظهر الـ QR كصورة عند فتح رابط Render
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    if (latestQR) {
        const code = qrImage.image(latestQR, { type: 'png' });
        res.writeHead(200, { 'Content-Type': 'image/png' });
        code.pipe(res);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('جاري تجهيز الرمز أو تم الاتصال بنجاح... قم بتحديث الصفحة بعد بضع ثوانٍ');
    }
}).listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

const GEMINI_API_KEY = "AQ.Ab8RN6JTgusFPUAhfYGiAK4sJKoMoesYFdwKE1jmk1PCZehinA";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: require('pino')({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            latestQR = qr;
            console.log('QR Code ready on web URL!');
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            latestQR = '';
            console.log('CONNECTED TO WHATSAPP SUCCESSFULLY!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text) continue;

            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent(text);
                const response = await result.response;
                await sock.sendMessage(from, { text: response.text() });
            } catch (error) {
                console.error('Error generating AI response:', error);
            }
        }
    });
}

connectToWhatsApp();
