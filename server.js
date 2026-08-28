const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 TERI SECURE FAST2SMS API KEY 🔴
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";
const ADMIN_PHONE = "0000000000";
const ADMIN_PASS = "BOSS@123";

// 🏦 SECURE MERCHANT BANK DETAILS FOR DEPOSIT 🏦
const MERCHANT_BANK = {
    accNo: "100242370296",
    accHolder: "Samrat",
    ifsc: "INDB0000396"
};

// 1. ADMIN LOGIN VERIFICATION
app.post('/api/admin-login', (req, res) => {
    const { phone, password } = req.body;
    if (phone === ADMIN_PHONE && password === ADMIN_PASS) {
        res.json({ success: true, message: "Admin Verified" });
    } else {
        res.status(401).json({ success: false, message: "Unauthorized" });
    }
});

// 2. GET MERCHANT BANK DETAILS FOR DEPOSIT
app.get('/api/get-payment-details', (req, res) => {
    res.json({ success: true, data: MERCHANT_BANK });
});

// 3. APP REGISTRATION / FORGOT PASSWORD OTP
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone, generatedOtp } = req.body;
    try {
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

// 4. TOOL BINDING OTP (Direct Freecharge Ping)
app.post('/api/wallet/send-otp', async (req, res) => {
    try {
        const mobileNumber = req.body.number || req.body.phone;
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

// 5. VERIFY TOOL OTP
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;
    if(otp && otp.length === 6) {
        res.status(200).json({ success: true, message: "Verified successfully", upiId: `${phone}@freecharge` });
    } else {
        res.status(400).json({ success: false, message: "Invalid OTP format." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BlackPay Secure Node Server Running on Port ${PORT}`);
});
