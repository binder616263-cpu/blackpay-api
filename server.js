const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios'); // Fast API Method

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 TERI FAST2SMS API KEY
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

// 🔴 TERA PAYTM MASTER AUTHORIZATION TOKEN
const PAYTM_AUTH_TOKEN = "Basic cGF5dG0tdW1wMjpsdDRJMUZLaVZGRndjTk5ScmxwS05pNW1LMk85TFQxdg==";

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay API Server Running!" });
});

// ============================================================================
// 0. API: SEND SMS VIA FAST2SMS
// ============================================================================
app.post('/api/send-sms', (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone or OTP missing." });

    const message = encodeURIComponent(`Your Verification Code is ${otp}`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=${message}&language=english&flash=0&numbers=${phone}`;

    https.get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                if (parsed.return === true) {
                    res.json({ success: true, message: "OTP Sent Successfully!" });
                } else {
                    res.status(400).json({ success: false, message: parsed.message[0] || "Fast2SMS Error" });
                }
            } catch (e) {
                res.json({ success: true, message: "OTP Requested!" });
            }
        });
    }).on("error", (err) => {
        res.status(500).json({ success: false, message: "Server SMS Error" });
    });
});

// ============================================================================
// 1. API: AUTOMATED SEND OTP (WALLET - API BASED)
// ============================================================================
let globalState = {}; // Temp memory

app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, walletType } = req.body; 
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });

    let walletName = walletType ? walletType.toLowerCase().trim() : "";
    globalState[phone] = { wallet: walletName }; 

    try {
        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log(`[+] API Mode: Requesting Paytm OTP for ${phone}`);
            
            try {
                // Direct API Call with Anti-Block Headers
                const paytmResponse = await axios.post('https://accounts.paytm.com/oauth2/v2/send-otp', {
                    phone: phone,
                    clientId: 'paytm-ump2'
                }, {
                    headers: {
                        'Authorization': PAYTM_AUTH_TOKEN,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Origin': 'https://dashboard.paytm.com',
                        'Referer': 'https://dashboard.paytm.com/',
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });

                if (paytmResponse.data && paytmResponse.data.status === 'SUCCESS') {
                    globalState[phone].state = paytmResponse.data.state; 
                    return res.json({ success: true, message: `OTP sent for ${phone}` });
                } else {
                    return res.status(400).json({ success: false, message: "Paytm API Error: " + (paytmResponse.data.message || "Invalid Response") });
                }
            } catch (apiError) {
                console.log(apiError.message);
                return res.status(400).json({ success: false, message: "Paytm server blocked request. Wait 1 min or try again." });
            }
        } 
        else {
            // Freecharge, Mobikwik, Phonepe bypass to manual entry
            res.json({ success: true, message: `OTP request registered for ${phone}` });
        }
    } catch (error) { 
        res.status(500).json({ success: false, message: "Network Error." }); 
    }
});

// ============================================================================
// 2. API: VERIFY OTP & EXTRACT OG UPI (API BASED)
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body; 
    if (!otp || !phone) return res.status(400).json({ success: false, message: "OTP and phone missing." });

    const sessionData = globalState[phone] || {};
    const walletName = sessionData.wallet || "";

    try {
        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log(`[+] Verifying Paytm OTP: ${otp}`);
            
            try {
                const verifyRes = await axios.post('https://accounts.paytm.com/oauth2/v2/verify-otp', {
                    otp: otp,
                    state: sessionData.state,
                    clientId: 'paytm-ump2'
                }, {
                    headers: {
                        'Authorization': PAYTM_AUTH_TOKEN,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Origin': 'https://dashboard.paytm.com'
                    }
                });

                if (verifyRes.data && verifyRes.data.access_token) {
                    const sessionToken = verifyRes.data.access_token;
                    console.log(`[+] Token received. Fetching Profile for OG UPI...`);

                    // 🔴 FETCH OG UPI USING SESSION TOKEN
                    const profileRes = await axios.get('https://dashboard.paytm.com/api/v1/merchant/profile', {
                        headers: {
                            'session_token': sessionToken,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                        }
                    });
                    
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                    const match = JSON.stringify(profileRes.data).match(upiRegex);
                    
                    if (match) {
                        return res.json({ success: true, message: "Account Bound!", upi_id: match[0], mobile: phone });
                    } else {
                        return res.status(400).json({ success: false, message: "Asli UPI ID nahi mili. Profile incomplete hai." });
                    }
                } else {
                    return res.status(400).json({ success: false, message: "Invalid OTP." });
                }
            } catch (err) {
                return res.status(400).json({ success: false, message: "Verification Failed. Check OTP." });
            }
        } 
        else {
            // For other wallets since no API is available yet
            let dummyUpi = "";
            if (walletName.includes('freecharge')) dummyUpi = `${phone}@freecharge`;
            else if (walletName.includes('mobikwik')) dummyUpi = `${phone}@ikwik`;
            else if (walletName.includes('phonepe')) dummyUpi = `${phone}@ybl`;
            
            res.json({ success: true, message: "Account Linked!", upi_id: dummyUpi, mobile: phone });
        }
    } catch (error) { 
        res.status(500).json({ success: false, message: "Validation Process Failed." }); 
    }
});

// ============================================================================
// 3. API: SMART VERIFY UTR
// ============================================================================
app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr } = req.body; 
    if (!utr) return res.status(400).json({ success: false, message: "UTR missing." });
    console.log(`[+] Processing UTR: ${utr}`);
    res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: utr });
});

app.listen(3000, '0.0.0.0', () => { console.log(`🚀 BlackPay Fast API Server running on port 3000`); });
