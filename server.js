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

// 🏦 MERCHANT BANK CONFIG 🏦
const MERCHANT_BANK = {
    accountNumber: "123456789012",
    ifsc: "SBIN0001234",
    beneficiaryName: "BlackPay Merchant",
    bankName: "State Bank of India"
};

const activeSessions = new Map();
let globalBrowser = null; // 🚀 GLOBAL BROWSER INSTANCE

// ============================================================================
// 🚀 INITIALIZE GLOBAL BROWSER ON SERVER START (BROWSER REUSE)
// ============================================================================
(async () => {
    console.log("[⏳] Initializing Ultra-Fast Global Browser...");
    let chromePath = null;
    if (fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")) {
        chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    } else if (fs.existsSync("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe")) {
        chromePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
    }

    globalBrowser = await puppeteer.launch({
        headless: false, // Set true for production backend
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
})();

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Ultra-Fast Server is Live!" }));
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
// 1. API: SEND OTP (FAST CONTEXT REUSE + RESOURCE BLOCKING)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const phone = req.body.number || req.body.phone;
    const { password, walletType } = req.body; 
    
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });
    if (!globalBrowser) return res.status(500).json({ success: false, message: "Server browser still initializing..." });

    let walletName = walletType ? walletType.toLowerCase().trim() : "freecharge";
    console.time(`[TIMING] SendOTP_Total_${phone}`);

    // Kill old session context if it exists
    if (activeSessions.has(phone)) {
        try {
            let oldSession = activeSessions.get(phone);
            if (oldSession.context) await oldSession.context.close();
        } catch(e) {}
        activeSessions.delete(phone);
    }

    let context, page;
    try {
        console.time(`[TIMING] Context_Creation_${phone}`);
        context = await globalBrowser.createBrowserContext();
        page = await context.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        console.timeEnd(`[TIMING] Context_Creation_${phone}`);

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
            if (blockedTypes.includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        // 🚀 PAYTM LOGIC
        if (walletName.includes('paytm')) {
            console.time(`[TIMING] PageLoad_Paytm_${phone}`);
            try { await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 25000 }); } 
            catch (e) { await context.close(); return res.status(400).json({ success: false, message: "Paytm server slow. Try again." }); }
            console.timeEnd(`[TIMING] PageLoad_Paytm_${phone}`);
            
            let inputField = null;
            for (let attempt = 0; attempt < 50; attempt++) {
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
                await new Promise(r => setTimeout(r, 100)); 
            }

            if (!inputField) {
                await context.close();
                return res.status(400).json({ success: false, message: "Paytm page load failed." });
            }

            await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 10 }); 
            await page.keyboard.press('Enter');

            if (password) {
                let passField = null; 
                for (let attempt = 0; attempt < 30; attempt++) {
                    let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
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
                    if (passField) break;
                    await new Promise(r => setTimeout(r, 100));
                }
                if (passField) {
                    await passField.focus(); await passField.click({ clickCount: 3 }); await passField.press('Backspace');
                    await passField.type(password, { delay: 10 });
                }
                await page.keyboard.press('Enter');
            }
        }
        // 🚀 FREECHARGE LOGIC
        else if (walletName.includes('freecharge')) {
            console.time(`[TIMING] PageLoad_FC_${phone}`);
            try { await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded', timeout: 25000 }); } 
            catch (e) { await context.close(); return res.status(400).json({ success: false, message: "Freecharge connection slow. Please try again." }); }
            console.timeEnd(`[TIMING] PageLoad_FC_${phone}`);

            let inputField = null;
            for (let attempt = 0; attempt < 50; attempt++) {
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
                await new Promise(r => setTimeout(r, 100));
            }

            if (inputField) {
                await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');
                await page.keyboard.type(phone, { delay: 10 });
            } else { await page.keyboard.type(phone, { delay: 10 }); }
            
            await page.keyboard.press('Enter');
        }
        // 🚀 MOBIKWIK LOGIC
        else if (walletName.includes('mobikwik')) {
            console.time(`[TIMING] PageLoad_Mobi_${phone}`);
            try { await page.goto('https://www.mobikwik.com/login', { waitUntil: 'domcontentloaded', timeout: 25000 }); } 
            catch (e) { await context.close(); return res.status(400).json({ success: false, message: "Mobikwik connection slow. Please try again." }); }
            console.timeEnd(`[TIMING] PageLoad_Mobi_${phone}`);

            let inputField = null;
            for (let attempt = 0; attempt < 50; attempt++) {
                let frames = []; try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached && frame.isDetached()) continue;
                        let inputs = await frame.$$('input:not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                let ph = await frame.evaluate(e => (e.placeholder + e.name + e.id).toLowerCase(), el);
                                if (ph.includes('mobile') || ph.includes('phone') || ph.includes('tel') || ph.includes('number')) { inputField = el; break; }
                            }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 100));
            }

            if (inputField) {
                await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');
                await page.keyboard.type(phone, { delay: 10 });
            } else { 
                await page.keyboard.type(phone, { delay: 10 }); 
            }
            
            await page.keyboard.press('Enter');
            
            // Just in case there's a specific Send OTP button on Mobikwik
            try {
                await page.evaluate(() => {
                    let btns = Array.from(document.querySelectorAll('button'));
                    let target = btns.find(b => b.innerText.toLowerCase().includes('otp') || b.innerText.toLowerCase().includes('send') || b.innerText.toLowerCase().includes('login'));
                    if (target) target.click();
                });
            } catch(e) {}
        }

        activeSessions.set(phone, { context, page, walletType: walletName });

        setTimeout(async () => {
            if (activeSessions.has(phone)) {
                try { await context.close(); } catch(e) {}
                activeSessions.delete(phone);
                console.log(`[!] Auto-closed context for ${phone} due to timeout.`);
            }
        }, 90000); 
        
        console.timeEnd(`[TIMING] SendOTP_Total_${phone}`);
        res.json({ success: true, message: `OTP request sent for ${phone}` });
    } catch (error) { 
        console.error("[-] Send OTP Error:", error.message);
        if (context) try { await context.close(); } catch(e){}
        activeSessions.delete(phone);
        res.status(500).json({ success: false, message: "Error: " + error.message }); 
    }
});

// ============================================================================
// 2. API: VERIFY OTP & SMART MERCHANT UPI EXTRACTION
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const phone = req.body.number || req.body.phone;
    const { otp } = req.body; 
    
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone or OTP missing." });

    if (!activeSessions.has(phone)) {
        return res.status(400).json({ success: false, message: "Session expired or not found. Please request OTP again." });
    }

    const session = activeSessions.get(phone);
    const { context, page, walletType: currentWallet } = session;

    console.time(`[TIMING] VerifyOTP_Total_${phone}`);
    try {
        console.log(`[+] Injecting OTP for ${phone}: ${otp}`);
        let frames = []; try { frames = [page, ...page.frames()]; } catch(e) { frames = [page]; }
        let otpTyped = false; let interceptedUpi = "";

        // 🚀 SMART API RESOLVER WITH MERCHANT PRIORITY
        let otpApiPromise = new Promise((resolve) => {
            let isResolved = false;
            const handler = async (response) => {
                if (isResolved) return;
                try {
                    const req = response.request(); if (req.method() === 'OPTIONS') return;
                    const url = response.url().toLowerCase(); const type = req.resourceType();
                    
                    if (type === 'xhr' || type === 'fetch') {
                        const text = await response.text();
                        
                        const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytm|paytmpty|paytmqr|freecharge|icici|ybl|axl|oksbi|apypaytm|mobikwik|ikwik|upi|ptsbi)/ig;
                        const matches = text.match(upiRegex);
                        
                        if (matches && matches.length > 0) {
                            let bizMatch = matches.find(m => m.toLowerCase().includes('pty') || m.toLowerCase().includes('qr') || m.toLowerCase().includes('ikwik'));
                            if (bizMatch) {
                                interceptedUpi = bizMatch; 
                            } else if (!interceptedUpi) {
                                interceptedUpi = matches[0]; 
                            }
                        }
                        
                        if (url.includes('verify') || url.includes('login') || url.includes('auth') || url.includes('otp')) {
                            if (response.status() >= 400) { isResolved = true; resolve(false); }
                            else {
                                const textLower = text.toLowerCase();
                                if (textLower.includes('"success":false') || textLower.includes('invalid otp') || textLower.includes('incorrect otp') || textLower.includes('wrong otp')) { 
                                    isResolved = true; resolve(false); 
                                } else if (textLower.includes('token') || textLower.includes('success":true')) {
                                    isResolved = true; resolve(true);
                                }
                            }
                        }
                    }
                } catch(e) {} 
            };
            page.on('response', handler);
            setTimeout(() => { if (!isResolved) { isResolved = true; resolve(true); } }, 5000);
        });

        console.time(`[TIMING] TypeOTP_${phone}`);
        for (let attempt = 0; attempt < 30; attempt++) {
            for (let frame of frames) {
                try {
                    if (frame.isDetached && frame.isDetached()) continue; 
                    let inputs = await frame.$$('input:not([type="hidden"])');
                    for (let el of inputs) {
                        let box = await el.boundingBox();
                        if (box && box.width > 0 && box.height > 0) {
                            await el.focus(); await el.click({ clickCount: 3 }); await el.press('Backspace');
                            await el.type(otp, { delay: 10 }); 
                            await frame.evaluate((inp) => { try { let tracker = inp._valueTracker; if (tracker) tracker.setValue(''); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); inp.blur(); } catch(err) {} }, el);
                            otpTyped = true; break;
                        }
                    }
                } catch (e) {}
                if (otpTyped) break;
            }
            if (otpTyped) break;
            await new Promise(r => setTimeout(r, 100));
        }

        if (!otpTyped) { try { await page.keyboard.type(otp, { delay: 10 }); } catch(e){} }
        
        // Push Enter, or find Submit button
        await page.keyboard.press('Enter');
        try {
            await page.evaluate(() => {
                let btns = Array.from(document.querySelectorAll('button'));
                let target = btns.find(b => b.innerText.toLowerCase().includes('submit') || b.innerText.toLowerCase().includes('verify'));
                if (target) target.click();
            });
        } catch(e) {}

        console.timeEnd(`[TIMING] TypeOTP_${phone}`);

        console.time(`[TIMING] API_Wait_${phone}`);
        const isOtpSuccess = await otpApiPromise;
        console.timeEnd(`[TIMING] API_Wait_${phone}`);

        if (!isOtpSuccess) { return res.status(400).json({ success: false, message: "Invalid OTP! Please try again." }); }

        let currentUrl = ""; try { currentUrl = page.url() || ""; } catch(e) { currentUrl = currentWallet; }
        let finalUpi = "";

        if (currentUrl.includes('freecharge') || currentWallet.includes('freecharge')) { 
            finalUpi = interceptedUpi || `${phone}@freecharge`; 
        } 
        else if (currentUrl.includes('paytm') || currentWallet.includes('paytm')) {
            console.time(`[TIMING] Paytm_UPI_Extract_${phone}`);
            
            if (!interceptedUpi || !interceptedUpi.toLowerCase().includes('pty')) {
                try {
                    await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e=>{});
                } catch(navErr) {}
            }

            for (let i = 0; i < 15; i++) {
                if (interceptedUpi && (interceptedUpi.toLowerCase().includes('pty') || interceptedUpi.toLowerCase().includes('qr'))) { 
                    finalUpi = interceptedUpi; break; 
                }
                
                try {
                    finalUpi = await page.evaluate(() => {
                        const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytm|paytmpty|paytmqr|upi)/ig;
                        const bodyText = document.documentElement.innerText;
                        let allMatches = [];
                        
                        let match1 = bodyText.match(regex);
                        if (match1) allMatches.push(...match1);

                        for (let j = 0; j < localStorage.length; j++) {
                            let val = localStorage.getItem(localStorage.key(j));
                            if (val && typeof val === 'string') {
                                let match2 = val.match(regex);
                                if (match2) allMatches.push(...match2);
                            }
                        }

                        if (allMatches.length > 0) {
                            let bizMatch = allMatches.find(u => u.toLowerCase().includes('@pty') || u.toLowerCase().includes('qr'));
                            if (bizMatch) return bizMatch;
                            return allMatches[0];
                        }
                        return "";
                    });
                } catch(e) {}

                if (finalUpi && (finalUpi.toLowerCase().includes('pty') || finalUpi.toLowerCase().includes('qr'))) break;
                
                if (i === 7 && !finalUpi) {
                    try { await page.goto('https://dashboard.paytm.com/next/profile', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(e=>{}); } catch(e) {}
                }
                await new Promise(r => setTimeout(r, 200));
            }
            
            if (interceptedUpi && interceptedUpi.toLowerCase().includes('pty') && !finalUpi.toLowerCase().includes('pty')) {
                finalUpi = interceptedUpi;
            }
            
            if (!finalUpi || finalUpi.trim() === "") { finalUpi = `${phone}@paytm`; }
            console.timeEnd(`[TIMING] Paytm_UPI_Extract_${phone}`);
        } 
        // 🚀 MOBIKWIK UPI CAPTURE
        else if (currentUrl.includes('mobikwik') || currentWallet.includes('mobikwik')) { 
            console.time(`[TIMING] Mobi_UPI_Extract_${phone}`);
            if (interceptedUpi && interceptedUpi.toLowerCase().includes('ikwik')) {
                finalUpi = interceptedUpi;
            } else {
                finalUpi = `${phone}@ikwik`;
            }
            console.timeEnd(`[TIMING] Mobi_UPI_Extract_${phone}`);
        } 
        else if (currentWallet.includes('phonepe')) { finalUpi = `${phone}@ybl`; }

        try { await context.close(); } catch(e) {}
        activeSessions.delete(phone);

        console.timeEnd(`[TIMING] VerifyOTP_Total_${phone}`);
        console.log(`[+] Success! Active UPI ID returned to client: ${finalUpi}`);
        
        res.json({ success: true, message: "Account Successfully Linked!", upiId: finalUpi, upi_id: finalUpi, mobile: phone });

    } catch (error) { 
        console.error("[-] Verify OTP Error:", error.message);
        try { await context.close(); } catch(e) {}
        activeSessions.delete(phone);
        res.status(500).json({ success: false, message: "Error: " + error.message }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 BlackPay Ultra-Fast Production Server running on port ${PORT}`); 
});
