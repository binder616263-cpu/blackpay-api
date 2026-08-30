const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');

// ANTI-CAPTCHA STEALTH MODE ACTIVATED
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 FAST2SMS API KEY 🔴
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

// 🏦 MERCHANT BANK DETAILS 🏦
const MERCHANT_BANK = {
    accNo: "100242370296",
    accHolder: "Samrat",
    ifsc: "INDB0000396"
};

const activeSessions = new Map();

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Production Server is Live!" }));
app.get('/api/get-payment-details', (req, res) => res.json({ success: true, data: MERCHANT_BANK }));

// ============================================================================
// 0. API: APP LOGIN & REGISTER OTP (FAST2SMS)
// ============================================================================
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone, generatedOtp } = req.body;
    if (!phone || !generatedOtp) return res.status(400).json({ success: false, message: "Phone or OTP missing." });

    try {
        const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=Your%20BlackPay%20OTP%20is%20${generatedOtp}&language=english&flash=0&numbers=${phone}`;
        const response = await axios.get(url, { timeout: 8000 });
        if (response.data.return === true) {
            res.json({ success: true, message: "OTP Sent successfully!" });
        } else {
            res.status(400).json({ success: false, message: response.data.message[0] || "Fast2SMS Error" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server SMS Error" });
    }
});

// ============================================================================
// 1. API: MULTI-USER AUTOMATED SEND OTP (TOOL BINDING - LOCAL BROWSER)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const phone = req.body.number || req.body.phone;
    const { password, walletType } = req.body; 
    
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });

    let walletName = walletType ? walletType.toLowerCase().trim() : "freecharge";

    if (activeSessions.has(phone)) {
        try {
            let oldSession = activeSessions.get(phone);
            if (oldSession.browser) await oldSession.browser.close();
        } catch(e) {}
        activeSessions.delete(phone);
    }

    let browser, page;
    try {
        console.log(`[+] Launching LOCAL browser for ${phone} (${walletName})`);
        
        let chromePath = null;
        if (fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")) {
            chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        } else if (fs.existsSync("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe")) {
            chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
        }

        browser = await puppeteer.launch({
            headless: "new",
            executablePath: chromePath || undefined,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        if (walletName.includes('paytm')) {
            try { await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 35000 }); } 
            catch (e) { await browser.close(); return res.status(400).json({ success: false, message: "Paytm server slow. Try again." }); }
            
            let inputField = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached && frame.isDetached()) continue;
                        let inputs = await frame.$$('input:not([type="password"]):not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) { inputField = el; break; }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!inputField) {
                await browser.close();
                return res.status(400).json({ success: false, message: "Paytm page load failed." });
            }

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
            catch (e) { await browser.close(); return res.status(400).json({ success: false, message: "Freecharge connection slow. Please try again." }); }
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

        activeSessions.set(phone, { browser, page, walletType: walletName });

        setTimeout(async () => {
            if (activeSessions.has(phone)) {
                try { await browser.close(); } catch(e) {}
                activeSessions.delete(phone);
                console.log(`[!] Auto-closed session for ${phone} due to timeout.`);
            }
        }, 90000);
        
        res.json({ success: true, message: `OTP request sent for ${phone}` });
    } catch (error) { 
        console.error("[-] Send OTP Error:", error.message);
        if (browser) try { await browser.close(); } catch(e){}
        res.status(500).json({ success: false, message: "Browser execution failed. Server overloaded." }); 
    }
});

// ============================================================================
// 2. API: MULTI-USER VERIFY OTP & ADVANCED UPI SCRAPING
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const phone = req.body.number || req.body.phone;
    const { otp } = req.body; 
    
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone or OTP missing." });

    if (!activeSessions.has(phone)) {
        return res.status(400).json({ success: false, message: "Session expired or not found. Please request OTP again." });
    }

    const session = activeSessions.get(phone);
    const { browser, page, walletType: currentWallet } = session;

    try {
        console.log(`[+] Injecting OTP for ${phone}: ${otp}`);
        
        let frames = []; try { frames = [page, ...page.frames()]; } catch(e) { frames = [page]; }
        let otpTyped = false; let interceptedUpi = ""; let isOtpApiFailed = false;

        const networkListener = async (response) => {
            try {
                const req = response.request(); if (req.method() === 'OPTIONS') return;
                const url = response.url().toLowerCase(); const type = req.resourceType();
                if (type === 'xhr' || type === 'fetch') {
                    const text = await response.text();
                    // 🔥 ADVANCED REGEX TO CAPTURE PAYTM MERCHANT HANDLES LIKE paytm.xxxx@pty 🔥
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytm|paytmpty|paytmqr|freecharge|icici|ybl|axl|oksbi|apypaytm|mobikwik|ikwik|upi|ptsbi)/i;
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
            finalUpi = `${phone}@freecharge`; 
        } 
        else if (currentUrl.includes('paytm') || currentWallet.includes('paytm')) {
            try {
                console.log("[+] Navigating to Paytm QR-Details & Profile for original merchant UPI...");
                await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(e=>{});
                await new Promise(r => setTimeout(r, 4000));
            } catch(navErr) {}

            // 🔥 SUPER-CHARGED MULTI-STEP UPI SCRAPER FOR PAYTM 🔥
            for (let i = 0; i < 20; i++) {
                if (interceptedUpi) { finalUpi = interceptedUpi; break; }
                try {
                    finalUpi = await page.evaluate(() => {
                        const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytm|paytmpty|paytmqr|upi)/i;
                        
                        // 1. Check innerText
                        const textMatch = document.documentElement.innerText.match(regex);
                        if (textMatch) return textMatch[0];

                        // 2. Check input/span/div text values
                        const elements = document.querySelectorAll('input, span, div, p, label, td, b');
                        for (let el of elements) {
                            let val = el.innerText || el.value || el.getAttribute('value') || '';
                            if (regex.test(val)) {
                                let m = val.match(regex);
                                if (m) return m[0];
                            }
                        }

                        // 3. Check LocalStorage
                        for (let j = 0; j < localStorage.length; j++) {
                            let val = localStorage.getItem(localStorage.key(j));
                            if (val && regex.test(val)) {
                                let m = val.match(regex);
                                if (m) return m[0];
                            }
                        }
                        return "";
                    });
                } catch(e) {}

                if (finalUpi) break;
                
                // Agar pehle page par na mile toh profile page par check karo
                if (i === 8) {
                    try {
                        await page.goto('https://dashboard.paytm.com/next/profile', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e=>{});
                        await new Promise(r => setTimeout(r, 3000));
                    } catch(e) {}
                }
                
                await new Promise(r => setTimeout(r, 1000));
            }
            
            if (!finalUpi || finalUpi.trim() === "") {
                finalUpi = `paytm.${phone}@pty`; // Updated smart fallback format
            }
        } 
        else if (currentWallet.includes('mobikwik')) { finalUpi = `${phone}@ikwik`; } 
        else if (currentWallet.includes('phonepe')) { finalUpi = `${phone}@ybl`; }

        try { await browser.close(); } catch(e) {}
        activeSessions.delete(phone);

        res.json({ success: true, message: "Account Successfully Linked!", upiId: finalUpi, upi_id: finalUpi, mobile: phone });

    } catch (error) { 
        console.error("[-] Verify OTP Error:", error.message);
        try { await browser.close(); } catch(e) {}
        activeSessions.delete(phone);
        res.status(500).json({ success: false, message: "Validation Process Failed." }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 BlackPay Multi-User Production Server running on port ${PORT}`); 
});
