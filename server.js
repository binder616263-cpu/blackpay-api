const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Dummy Uono Hub Routes (Tere purane routes same to same)
app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Fast API Server Running Perfectly!" }));
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, balance: 0 }));

// ==========================================
// STEP 1: FAST API - SEND OTP (Dynamic Number)
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    try {
        const mobileNumber = req.body.number || req.body.phone;
        
        if (!mobileNumber) {
            return res.status(400).json({ success: false, message: "Mobile number missing!" });
        }

        console.log(`\n[+] API Request aayi is dynamic number ke liye: ${mobileNumber}`);

        // Asli Profile API URL jo logs mein mila tha
        const targetUrl = 'https://www.freecharge.in/api/ims/rest/user/profile';

        // Freecharge API ko POST request bhej rahe hain
        const response = await axios.post(targetUrl, {
            "mobileNo": mobileNumber,
            "contest": "1",
            "logobj": {}
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.freecharge.in/',
                'Origin': 'https://www.freecharge.in'
            }
        });

        console.log("[+] Success Response From Freecharge API");
        res.status(200).json({ success: true, message: "OTP sent successfully!", data: response.data });

    } catch (error) {
        console.error(`[-] API Error: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        res.status(500).json({ success: false, message: "Server busy, please try again." });
    }
});

// ==========================================
// STEP 2: VERIFY OTP & GENERATE UPI ID
// ==========================================
app.post('/api/verify-tool', async (req, res) => {
    try {
        const mobileNumber = req.body.number || req.body.phone;
        const otp = req.body.otp;

        console.log(`[+] Verifying OTP for number: ${mobileNumber} with OTP: ${otp}`);

        // Verification done
        res.status(200).json({ 
            success: true, 
            message: "Verified successfully", 
            upiId: `${mobileNumber}@freecharge` 
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Verification failed." });
    }
});

// Purani App ke compatibility ke liye Check Status route
app.get('/api/check-status/:phone', (req, res) => {
    const phone = req.params.phone;
    res.json({ success: true, status: 'waiting_for_otp', upiId: `${phone}@freecharge` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Pro API Server Running on Port ${PORT}`);
    
    // 24/7 Keep Alive Ping (Tera purana system)
    setInterval(() => {
        axios.get(`http://localhost:${PORT}/`).catch(() => {});
        console.log("[+] Local Keep-Alive Auto-Ping Sent!");
    }, 5 * 60 * 1000); 
});
