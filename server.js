const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Sirf Axios, No Puppeteer, No Browserless!

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

let activeSessions = {};

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay API Master Server (Direct API Edition) Running!" }));

// Dummy Uono Hub Routes
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, balance: 0 }));

// ==========================================
// STEP 1: TRIGGER OTP VIA DIRECT API
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    activeSessions[phone] = { status: 'waiting_for_otp', upiId: null, stateId: null };

    try {
        console.log(`[+] Firing DIRECT API for: ${phone}`);

        if (walletType.toLowerCase().includes('freecharge')) {
            // Freecharge API Setup here
            res.json({ success: true, message: "Freecharge API Triggered!" });
        } else {
            // 🔥 YAHAN CHARLES PROXY KA DATA DAALNA HAI 🔥
            
            const paytmApiUrl = "CHARLES_WALA_PAYTM_OTP_URL_YAHAN_DAAL";

            const payload = {
                // Charles se copy ki hui JSON body
                "mobileNumber": phone,
                "clientId": "CHARLES_SE_DEKH_KAR_DAAL"
            };

            const headers = {
                // Charles se Asli Headers copy kar (Jo important lagein, jaise User-Agent, Client-Id, x-app-version)
                'User-Agent': 'PaytmBusiness/10.2.3 (Android; 13)', // Example
                'Content-Type': 'application/json',
                // 'authorization': 'Bearer xyz...', // Agar charles me ho toh daalna
            };

            // Request bhej rahe hain Render se seedha Paytm server ko
            const response = await axios.post(paytmApiUrl, payload, { headers: headers });
            
            console.log(`[✔] API Hit Success! Response:`, response.data);
            
            // Agar Paytm response mein koi ID (stateId) bhejta hai verify karne ke liye, toh use save kar le
            // activeSessions[phone].stateId = response.data.stateId; 
        }
        
        // Browser ka jhanjhat khatam, turant success return!
        res.json({ success: true, message: "OTP sent directly via API! Waiting for input..." });

    } catch (e) {
        console.log(`[-] API Error on ${phone}:`, e.response ? JSON.stringify(e.response.data) : e.message);
        res.status(500).json({ success: false, message: "API Blocked or Error. Check Render Logs." });
    }
});

// ==========================================
// STEP 2: VERIFY OTP
// ==========================================
app.post('/api/verify-tool', async (req, res) => {
    const { phone, otp } = req.body;
    console.log(`[+] Verifying OTP ${otp} for ${phone} via API`);

    if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
        try {
            // 🛑 YAHAN CHARLES SE NIKALI HUI VERIFY WALI API LAGEGI 🛑
            // Abhi ke liye Dummy success bhej rahe hain jab tak tu API nahi lagata
            
            let upi = `${phone}@paytm`; // Dummy UPI

            console.log(`[✔] Extracted UPI: ${upi}`);
            
            delete activeSessions[phone];
            res.json({ success: true, message: "Bound Successfully!", upiId: upi });
            
        } catch (e) {
            delete activeSessions[phone];
            res.json({ success: false, message: "Failed to verify OTP via API" });
        }
    } else {
        res.json({ success: false, message: "Session expired. Try again." });
    }
});

// Keep Alive
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
    console.log(`🚀 API Master Server Running on Port ${PORT}`);
    setInterval(() => {
        axios.get(`http://localhost:${PORT}/`).catch(() => {});
    }, 5 * 60 * 1000); 
});
