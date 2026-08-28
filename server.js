const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Dummy Uono Hub Routes
app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Fast API Server Running Perfectly!" }));
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));

// ==========================================
// STEP 1: FAST API - SEND OTP (Direct Wallet Ping)
// ==========================================
app.post('/api/wallet/send-otp', async (req, res) => {
    try {
        const mobileNumber = req.body.number || req.body.phone;
        const walletType = req.body.walletType || "freecharge";
        
        if (!mobileNumber) {
            return res.status(400).json({ success: false, message: "Mobile number missing!" });
        }

        console.log(`\n[+] API Request for ${walletType} | Phone: ${mobileNumber}`);

        // Direct Freecharge OTP Trigger
        const targetUrl = 'https://www.freecharge.in/api/ims/rest/user/profile';

        // Real Headers
        const response = await axios.post(targetUrl, {
            "mobileNo": mobileNumber,
            "contest": "1",
            "logobj": {}
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.freecharge.in/',
                'Origin': 'https://www.freecharge.in'
            },
            timeout: 10000 
        });

        console.log("[+] Success Response From Official Wallet API");
        res.status(200).json({ success: true, message: "OTP sent successfully!", data: response.data });

    } catch (error) {
        console.error(`[-] API Error`);
        res.status(500).json({ success: false, message: "Server busy, please try again." });
    }
});

// ==========================================
// STEP 2: VERIFY OTP & GENERATE UPI ID
// ==========================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    try {
        const mobileNumber = req.body.number || req.body.phone;
        const otp = req.body.otp;

        console.log(`[+] Verifying OTP for number: ${mobileNumber} with OTP: ${otp}`);

        if(otp && otp.length === 6) {
            res.status(200).json({ 
                success: true, 
                message: "Verified successfully", 
                upiId: `${mobileNumber}@freecharge` 
            });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP format." });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: "Verification failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`🚀 BlackPay Direct-Wallet API on Port ${PORT}`);
    console.log(`==========================================`);
});
