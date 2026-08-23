const express = require('express');
const cors = require('cors');
const axios = require('axios'); // 🔥 Bas Axios bacha hai, Puppeteer ki chhutti!

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

let activeSessions = {};

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay API Master Server (Brahmastra Edition) Running!" }));

// Dummy Uono Hub Routes
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, balance: 0 }));

// ==========================================
// STEP 1: TRIGGER OTP VIA DIRECT API (NO BROWSER)
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    // API stateId save karegi verification ke time ke liye
    activeSessions[phone] = { status: 'waiting_for_otp', upiId: null, stateId: null };

    try {
        console.log(`[+] Firing API BRAHMASTRA for: ${phone}`);

        if (walletType.toLowerCase().includes('freecharge')) {
            console.log(`[!] Hitting Freecharge API for ${phone}...`);
            // Yahan tu future mein Freecharge ki Charles wali API daal sakta hai
            res.json({ success: true, message: "Freecharge API Triggered!" });

        } else {
            console.log(`[!] Hitting Paytm Business API for ${phone}...`);
            
            // 🛑 TERA KAAM YAHAN SE SHURU HOTA HAI 🛑
            // Niche diye gaye URL, Payload aur Headers mein apne CHARLES PROXY ka data daalna hai
            
            const paytmApiUrl = "https://api.example.com/paytm/send-otp"; // TERA CHARLES URL YAHAN DAALNA

            const payload = {
                "mobileNumber": phone,
                "clientId": "REPLACE_WITH_CHARLES_DATA" // Charles ki JSON body se copy kar
            };

            const headers = {
                'User-Agent': 'PaytmBusiness/10.2.3 (Android; 13)', // Charles se Asli User-Agent nikal
                'Content-Type': 'application/json',
                'client-id': 'REPLACE_WITH_CHARLES_HEADER',
                // Aur jo bhi extra headers (Authorization etc.) Charles mein dikhein, wo yahan chipka de
            };

            // 🔥 JAB CHARLES SE DATA NIKAL LE, TOH NICHE WALI 2 LINE KA COMMENT HATA DENA (Remove //) 🔥
            // const response = await axios.post(paytmApiUrl, payload, { headers: headers });
            // activeSessions[phone].stateId = response.data.stateId; // API response se ID save karni padegi
            
            console.log(`[✔] Paytm API Hit Successfully!`);
        }
        
        // Browser ka wait nahi, 1 second mein turant success!
        res.json({ success: true, message: "OTP sent directly via API! Waiting for input..." });

    } catch (e) {
        console.log(`[-] API Error on ${phone}:`, e.response ? e.response.data : e.message);
        res.status(500).json({ success: false, message: "API Blocked: " + (e.response ? JSON.stringify(e.response.data) : e.message) });
    }
});

// ==========================================
// STEP 2: VERIFY OTP & EXTRACT UPI VIA API
// ==========================================
app.post('/api/verify-tool', async (req, res) => {
    const { phone, otp } = req.body;
    console.log(`[+] Verifying OTP ${otp} for ${phone} via API`);

    if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
        try {
            console.log(`[!] Hitting API to Verify OTP...`);

            // 🛑 YAHAN BHI CHARLES SE NIKALI HUI DOOSRI (VERIFY WALI) API LAGEGI 🛑
            const verifyApiUrl = "https://api.example.com/paytm/verify-otp"; // CHARLES URL

            const payload = {
                "mobileNumber": phone,
                "otp": otp,
                "stateId": activeSessions[phone].stateId // Jo first API ne id di thi
            };

            const headers = {
                'User-Agent': 'PaytmBusiness/10.2.3 (Android; 13)',
                'Content-Type': 'application/json',
                // Charles wale baaki headers
            };

            // 🔥 JAB CHARLES SE DATA NIKAL LE, TOH NICHE WALI 2 LINE KA COMMENT HATA DENA 🔥
            // const response = await axios.post(verifyApiUrl, payload, { headers: headers });
            // const upi = response.data.upiId; // JSON response se asli UPI ID aise niklegi
            
            // Abhi ke liye Dummy UPI (Jab tak tu asli API set nahi karta)
            let upi = `${phone}@paytm`; 

            console.log(`[✔] Extracted UPI via API JSON: ${upi}`);
            
            delete activeSessions[phone];
            res.json({ success: true, message: "Bound Successfully!", upiId: upi });
            
        } catch (e) {
            console.log(`[-] Verify Error:`, e.response ? e.response.data : e.message);
            delete activeSessions[phone];
            res.json({ success: false, message: "Failed to verify OTP via API" });
        }
    } else {
        res.json({ success: false, message: "Session expired. Try again." });
    }
});

// ==========================================
// STATUS CHECKER & KEEP ALIVE
// ==========================================
app.get('/api/check-status/:phone', (req, res) => {
    const phone = req.params.phone;
    if (activeSessions[phone]) {
        res.json({ success: true, status: activeSessions[phone].status, upiId: activeSessions[phone].upiId });
    } else {
        res.json({ success: false, status: 'not_found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Brahmastra Server Running on Port ${PORT}`);
    
    // 🔥 24/7 RENDER KEEP-ALIVE JUGAAD 🔥
    setInterval(() => {
        axios.get(`http://localhost:${PORT}/`).catch(() => {});
        console.log("[+] 24/7 Keep-Alive Auto-Ping Sent!");
    }, 5 * 60 * 1000); 
});
