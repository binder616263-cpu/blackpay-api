const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios'); // Naya fast method

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
    globalState[phone] = { wallet: walletName }; // Store for verification step

    try {
        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log(`[+] API Mode: Requesting Paytm OTP for ${phone}`);
            
            try {
                // Direct API Call to Paytm for OTP using your Token
                const paytmResponse = await axios.post('https://accounts.paytm.com/oauth2/v2/send-otp', {
                    phone: phone,
                    clientId: 'paytm-ump2'
                }, {
                    headers: {
                        'Authorization': PAYTM_AUTH_TOKEN,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                if (paytmResponse.data && paytmResponse.data.status === 'SUCCESS') {
                    globalState[phone].state = paytmResponse.data.state; // Paytm return karta hai verification state
                    return res.json({ success: true, message: `OTP sent for ${phone}` });
                } else {
                    return res.status(400).json({ success: false, message: "Paytm API Error: " + (paytmResponse.data.message || "Invalid Response") });
                }
            } catch (apiError) {
                return res.status(400).json({ success: false, message: "Paytm server blocked request. Change IP or Try again." });
            }
        } 
        else {
            // For Freecharge, Mobikwik, Phonepe (Send generic success so frontend shows step 2)
            res.json({ success: true, message: `OTP request registered for ${phone}` });
        }
    } catch (error) { 
        res.status(500).json({ success: false, message: "Network Error." }); 
    }
});

// ============================================================================
// 2. API: VERIFY OTP & EXTRACT UPI (API BASED)
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body; 
    if (!otp) return res.status(400).json({ success: false, message: "OTP missing." });

    const sessionData = globalState[phone] || {};
    const walletName = sessionData.wallet || "";

    try {
        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log(`[+] API Mode: Verifying Paytm OTP: ${otp}`);
            
            try {
                const verifyRes = await axios.post('https://accounts.paytm.com/oauth2/v2/verify-otp', {
                    otp: otp,
                    state: sessionData.state,
                    clientId: 'paytm-ump2'
                }, {
                    headers: {
                        'Authorization': PAYTM_AUTH_TOKEN,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                if (verifyRes.data && verifyRes.data.access_token) {
                    const sessionToken = verifyRes.data.access_token;
                    console.log(`[+] Token received. Fetching Profile...`);

                    // Get Profile using token to get UPI
                    const profileRes = await axios.get('https://dashboard.paytm.com/api/v1/merchant/profile', {
                        headers: {
                            'session_token': sessionToken,
                            'User-Agent': 'Mozilla/5.0'
                        }
                    });
                    
                    // Regex search on JSON string response for @pty / @paytm
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                    const match = JSON.stringify(profileRes.data).match(upiRegex);
                    
                    if (match) {
                        return res.json({ success: true, message: "Account Bound!", upi_id: match[0], mobile: phone });
                    } else {
                        return res.status(400).json({ success: false, message: "UPI ID not found in profile." });
                    }
                } else {
                    return res.status(400).json({ success: false, message: "Invalid OTP." });
                }
            } catch (err) {
                return res.status(400).json({ success: false, message: "Verification API Failed." });
            }
        } 
        else {
            // For other wallets, use regex logic directly since no automation is running in this version
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
// 3. API: SMART VERIFY UTR (Mocked API version since no puppeteer)
// ============================================================================
app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr } = req.body; 
    if (!utr) return res.status(400).json({ success: false, message: "UTR missing." });
    
    console.log(`[+] Processing UTR: ${utr}`);
    
    // Yahan original API logic aayega agar tu banking APIs laga rha hai.
    // Filhaal without puppeteer, we push it to manual confirmation automatically.
    res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: utr });
});

app.listen(3000, '0.0.0.0', () => { console.log(`🚀 BlackPay Fast API Server running on port 3000`); });
