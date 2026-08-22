const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs'); 
const path = require('path');

// ANTI-CAPTCHA STEALTH MODE ACTIVATED
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 FAST2SMS API KEY
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay Master Server Running!" });
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

let browser;
let page;
let currentPhone = "";
let currentWallet = "";

// ============================================================================
// 1. API: AUTOMATED SEND OTP (WALLET) WITH SESSION DESTROYER
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });

    if (browser) { try { await browser.close(); } catch(e) {} browser = null; }

    try {
        let walletName = walletType ? walletType.toLowerCase().trim() : "";
        currentPhone = phone; currentWallet = walletName;
        
        console.log(`\n[+] New Login Request -> Phone: ${phone} | Wallet: ${walletName.toUpperCase()}`);
        
        // 🔴 TERA SESSION DELETE LOGIC 🔴
        const sessionDir = path.join(__dirname, 'sessions', `wallet_${phone}`);
        if (fs.existsSync(sessionDir)) {
            console.log(`[!] Purana session delete kar rahe hain...`);
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        
        try {
            browser = await puppeteer.connect({ 
                browserWSEndpoint: 'wss://chrome.browserless.io?token=2V6jGIUi9i2HHBN13c561fc98136daa73b9388455b558503a&stealth=true&--disable-web-security=true&--disable-blink-features=AutomationControlled',
                defaultViewport: { width: 1920, height: 1080 }
            });
        } catch (connErr) {
            return res.status(500).json({ success: false, message: "Browser Limit Full! Please wait 1 min and try again." });
        }
        
        page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

        if (walletName === 'paytm' || walletName === 'paytm business') {
            try { await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 35000 }); } 
            catch (e) { return res.status(400).json({ success: false, message: "Paytm server slow. Try again." }); }
            
            let targetFrame = null; let inputField = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached && frame.isDetached()) continue;
                        let inputs = await frame.$$('input:not([type="password"]):not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) { inputField = el; targetFrame = frame; break; }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!inputField) return res.status(400).json({ success: false, message: "Paytm page load failed." });

            await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 100 }); 
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 3000));

            if (password) {
                let passField = null; let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached && frame.isDetached()) continue;
                        let fields = await frame.$$('input[type="password"]');
                        for (let el of fields) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) { passField = el; break; }
                        }
                    } catch (e) {}
                    if (passField) break;
                }
                if (passField) {
                    await passField.focus(); await passField.click({ clickCount: 3 }); await passField.press('Backspace');
                    await passField.type(password, { delay: 100 }); await new Promise(r => setTimeout(r, 1000));
                }
            }
            await page.keyboard.press('Enter');
        }
        else if (walletName.includes('freecharge')) {
            try { await page.goto('https://www.freecharge.in/', { waitUntil: 'networkidle2', timeout: 35000 }); } 
            catch (e) { return res.status(400).json({ success: false, message: "Freecharge connection slow. Please try again." }); }
            await new Promise(r => setTimeout(r, 3000)); 

            let inputField = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached && frame.isDetached()) continue;
                        let inputs = await frame.$$('input:not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                let ph = await frame.evaluate(e => e.placeholder || '', el).then(p => p.toLowerCase());
                                if (ph.includes('mobile') || ph.includes('phone') || ph.includes('number')) { inputField = el; break; }
                            }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (inputField) {
                await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');
                await page.keyboard.type(phone, { delay: 100 });
            } else { await page.keyboard.type(phone, { delay: 100 }); }
            
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
        }
        else {
            if (walletName.includes('mobikwik')) { await page.goto('https://www.mobikwik.com/', { waitUntil: 'domcontentloaded', timeout: 35000 }); await new Promise(r => setTimeout(r, 3000)); try { await page.mouse.click(1250, 25); } catch(e){} } 
            else if (walletName.includes('phonepe')) { await page.goto('https://business.phonepe.com/login', { waitUntil: 'domcontentloaded', timeout: 35000 }); }
            await new Promise(r => setTimeout(r, 3000));
            try { await page.evaluate((num) => { const inputs = document.querySelectorAll('input'); for (let inp of inputs) { if (inp.offsetParent !== null) { inp.focus(); inp.value = num; inp.dispatchEvent(new Event('input', { bubbles: true })); return true; } } }, phone); } catch(e){}
            await new Promise(r => setTimeout(r, 1000));
            try { await page.keyboard.press('Enter'); } catch(e){}
        }
        
        res.json({ success: true, message: `OTP request sent for ${phone}` });
    } catch (error) { res.status(500).json({ success: false, message: "Network Error." }); }
});

// ============================================================================
// 2. API: VERIFY OTP & EXTRACT UPI (@pty FIX APPLIED)
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp } = req.body; 
    if (!page) return res.status(400).json({ success: false, message: "Browser session not active." });

    try {
        console.log(`[+] Injecting OTP: ${otp}`);
        
        let frames = []; try { frames = [page, ...page.frames()]; } catch(e) { frames = [page]; }
        let otpTyped = false; let interceptedUpi = ""; let isOtpApiFailed = false;

        const networkListener = async (response) => {
            try {
                const req = response.request(); if (req.method() === 'OPTIONS') return;
                const url = response.url().toLowerCase(); const type = req.resourceType();
                if (type === 'xhr' || type === 'fetch') {
                    const text = await response.text();
                    
                    // 🔴 TERA PAYTM @pty REGEX WAPAS LAGA DIYA
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|freecharge|icici|ybl|axl|oksbi|apypaytm|mobikwik|ikwik|upi|ptsbi)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) { interceptedUpi = match[0]; }
                    if (url.includes('verify') || url.includes('login') || url.includes('auth') || url.includes('otp')) {
                        if (response.status() >= 400) { isOtpApiFailed = true; } else {
                            const textLower = text.toLowerCase();
                            if (textLower.includes('"success":false') || textLower.includes('invalid otp') || textLower.includes('incorrect otp') || textLower.includes('wrong otp')) { isOtpApiFailed = true; }
                        }
                    }
                }
            } catch(e) {} 
        };
        page.on('response', networkListener);

        for (let frame of frames) {
            try {
                if (frame.isDetached && frame.isDetached()) continue; 
                let inputs = await frame.$$('input:not([type="hidden"])');
                for (let el of inputs) {
                    let box = await el.boundingBox();
                    if (box && box.width > 0 && box.height > 0) {
                        await el.focus(); await el.click({ clickCount: 3 }); await el.press('Backspace');
                        await el.type(otp, { delay: 100 }); 
                        await frame.evaluate((inp) => { try { let tracker = inp._valueTracker; if (tracker) tracker.setValue(''); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.blur(); } catch(err) {} }, el);
                        otpTyped = true; break;
                    }
                }
            } catch (e) {}
            if (otpTyped) break;
        }

        if (!otpTyped) { try { await page.keyboard.type(otp, { delay: 100 }); } catch(e){} }
        await new Promise(r => setTimeout(r, 1000));
        await page.keyboard.press('Enter');

        await new Promise(r => setTimeout(r, 5000)); 
        if (isOtpApiFailed) { return res.status(400).json({ success: false, message: "Invalid OTP! Please try again." }); }

        let currentUrl = ""; try { currentUrl = page.url() || ""; } catch(e) { currentUrl = currentWallet; }
        let finalUpi = "";

        if (currentUrl.includes('freecharge') || currentWallet.includes('freecharge')) { 
            finalUpi = `${currentPhone}@freecharge`; 
        } 
        else if (currentUrl.includes('paytm') || currentWallet.includes('paytm')) {
            console.log("[+] Searching Paytm Details...");
            
            try {
                await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(e=>{});
                await new Promise(r => setTimeout(r, 6000)); 
            } catch(navErr) {}

            for (let i = 0; i < 15; i++) {
                if (interceptedUpi) { finalUpi = interceptedUpi; break; }
                try {
                    finalUpi = await page.evaluate(() => {
                        // 🔴 PAYTM @pty REGEX
                        const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                        const textMatch = document.body.innerText.match(regex);
                        if (textMatch) return textMatch[0];
                        for (let j = 0; j < localStorage.length; j++) {
                            let val = localStorage.getItem(localStorage.key(j));
                            if (val && regex.test(val)) return val.match(regex)[0];
                        }
                        return "";
                    });
                } catch(e) {}
                if (finalUpi) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            
            if (!finalUpi || finalUpi.trim() === "") {
                return res.status(400).json({ success: false, message: "UPI Extraction Failed. Try again or check wallet." });
            }
        } 
        else if (currentWallet.includes('mobikwik')) { finalUpi = `${currentPhone}@ikwik`; } 
        else if (currentWallet.includes('phonepe')) { finalUpi = `${currentPhone}@ybl`; }

        res.json({ success: true, message: "Account Successfully Linked!", upi_id: finalUpi, mobile: currentPhone });

    } catch (error) { res.status(500).json({ success: false, message: "Validation Process Failed." }); }
});

app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr } = req.body; 
    if (!page) return res.status(400).json({ success: false, message: "Browser session not active." });
    if (!utr) return res.status(400).json({ success: false, message: "UTR missing." });
    try {
        let currentUrl = ""; try { currentUrl = page.url() || ""; } catch(e){}
        try {
            if (currentUrl.includes('freecharge') || currentWallet.includes('freecharge')) { await page.goto('https://www.freecharge.in/desktop/app/transactions', { waitUntil: 'domcontentloaded', timeout: 45000 }); } 
            else if (currentUrl.includes('mobikwik') || currentWallet.includes('mobikwik')) { await page.goto('https://www.mobikwik.com/history', { waitUntil: 'domcontentloaded', timeout: 45000 }); } 
            else if (currentUrl.includes('phonepe') || currentWallet.includes('phonepe')) { await page.goto('https://business.phonepe.com/transactions', { waitUntil: 'domcontentloaded', timeout: 45000 }); } 
            else { await page.goto('https://dashboard.paytm.com/next/passbook', { waitUntil: 'domcontentloaded', timeout: 45000 }); }
        } catch(navErr) {}
        await new Promise(r => setTimeout(r, 4000)); 
        let isFound = false;
        try { isFound = await page.evaluate((searchUtr) => { const bodyText = document.body.innerText.replace(/\s+/g, ''); return bodyText.includes(searchUtr); }, utr.trim()); } catch(e) {}
        if (isFound) { res.json({ success: true, message: "Payment Verified Successfully!", utr: utr }); } else { res.json({ success: false, message: "UTR Not Found." }); }
    } catch (error) { res.status(500).json({ success: false, message: "UTR Verification process failed.", error: error.message }); }
});

app.listen(3000, '0.0.0.0', () => { console.log(`🚀 BlackPay Server running on port 3000`); });
