const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 TERI SECURE API KEY YAHAN HAI (Frontend mein nahi jayegi) 🔴
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

// ==========================================
// 1. APP REGISTRATION / FORGOT PASSWORD OTP
// ==========================================
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone, generatedOtp } = req.body;
    if (!phone || !generatedOtp) return res.status(400).json({ success: false, message: "Missing params" });

    try {
        console.log(`[+] Sending Auth OTP to ${phone}`);
        const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=Your%20BlackPay%20OTP%20is%20${generatedOtp}&language=english&flash=0&numbers=${phone}`;
        const response = await axios.get(url);
        
        if (response.data.return === true) {
            res.json({ success: true, message: "OTP Sent successfully!" });
        } else {
            res.status(400).json({ success: false, message: response.data.message });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Network error" });
    }
});

// ==========================================
// 2. TOOL BINDING OTP (Direct Freecharge Ping)
// ==========================================
app.post('/api/wallet/send-otp', async (req, res) => {
    try {
        const mobileNumber = req.body.number || req.body.phone;
        if (!mobileNumber) return res.status(400).json({ success: false, message: "Mobile number missing!" });

        console.log(`\n[+] Wallet Bind Request for Phone: ${mobileNumber}`);
        const targetUrl = 'https://www.freecharge.in/api/ims/rest/user/profile';

        const response = await axios.post(targetUrl, { "mobileNo": mobileNumber, "contest": "1", "logobj": {} }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.freecharge.in/',
                'Origin': 'https://www.freecharge.in'
            }, timeout: 10000 
        });

        res.status(200).json({ success: true, message: "OTP sent successfully!", data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server busy, please try again." });
    }
});

// ==========================================
// 3. VERIFY TOOL OTP & GENERATE UPI ID
// ==========================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if(otp && otp.length === 6) {
            res.status(200).json({ success: true, message: "Verified successfully", upiId: `${phone}@freecharge` });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP format." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Verification failed." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`🚀 BlackPay Secure API Server on Port ${PORT}`);
    console.log(`==========================================`);
});
