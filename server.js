const express = require('express');
const cors = require('cors');
const fs = require('fs'); 
const path = require('path');

// ANTI-CAPTCHA STEALTH MODE ACTIVATED
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    jsonResponse = { success: true, message: "BlackPay Server is Live & Running!" };
    res.json(jsonResponse);
});

// Global variables
let browser;
let page;
let currentPhone = "";
let currentWallet = "";
let autoCloseTimer;

// 🔴 AUTO-KILLER: Har 90 second idle rehne par browser kill karega taaki Limit full na ho!
function keepSessionAlive() {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = setTimeout(async () => {
        if (browser) {
            console.log("⏱️ [!] 90s Idle Timeout. Closing Browserless session to free Limit.");
            try { await browser.close(); } catch(e) {}
            browser = null;
            page = null;
        }
    }, 90000);
}

console.log("🔥 BlackPay Server Active (Paytm Fixed + Freecharge React Bypass + Network Validations)...");

async function dismissPopups(page) {
    try {
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button, div, span, a, i');
            elements.forEach(el => {
                const text = el.innerText ? el.innerText.toUpperCase() : '';
                if (text.includes('CLOSE') || text === 'X' || el.className.includes('close')) el.click();
            });
        });
    } catch (e) {}
}

// ============================================================================
// 1. API: AUTOMATED SEND OTP
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 

    if (!phone || phone.length !== 10) {
        return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });
    }

    if (browser) {
        try { await browser.close(); } catch(e) {}
        browser = null;
    }
    clearTimeout(autoCloseTimer);

    try {
        let walletName = walletType ? walletType.toLowerCase() : "";
        currentPhone = phone;
        currentWallet = walletName;

        console.log(`\n[+] New Login Request -> Phone: ${phone} | Wallet: ${walletName.toUpperCase()}`);
        
        try {
            browser = await puppeteer.connect({ 
                browserWSEndpoint: 'wss://chrome.browserless.io?token=2V6jGIUi9i2HHBN13c561fc98136daa73b9388455b558503a&stealth=true&--disable-web-security=true&--disable-blink-features=AutomationControlled',
                defaultViewport: { width: 1920, height: 1080 }
            });
        } catch (connErr) {
            return res.status(500).json({ success: false, message: "Browser Limit Full! Please wait 1 min and try again." });
        }
        
        page = await browser.newPage();
        keepSessionAlive(); 
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { 
            Object.defineProperty(navigator, 'webdriver', { get: () => false }); 
        });

        await page.setRequestInterception(true);
        page.on('request', async (req) => {
            if (req.isInterceptResolutionHandled()) return;
            try {
                if (['image', 'media'].includes(req.resourceType())) { await req.abort('aborted'); } 
                else { await req.continue(); }
            } catch(e) {}
        });

        // ================= PAYTM FLOW =================
        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log("[+] Opening Paytm Business login page...");
            try {
                await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 35000 });
            } catch (e) {
                return res.status(400).json({ success: false, message: "Paytm server slow or blocked. Try again." });
            }
            
            let targetFrame = null;
            let inputField = null;

            for (let attempt = 0; attempt < 15; attempt++) {
                let frames = [];
                try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached && frame.isDetached()) continue;
                        let inputs = await frame.$$('input:not([type="password"]):not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                inputField = el; targetFrame = frame; break;
                            }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!inputField) return res.status(400).json({ success: false, message: "Paytm page load failed." });

            await inputField.focus();
            await inputField.click({ clickCount: 3 }); 
            await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 100 }); 
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 3000));

            if (password) {
                let passField = null;
                let frames = [];
                try { frames = page.frames(); } catch(e) { frames = [page]; }
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
                    await passField.focus();
                    await passField.click({ clickCount: 3 });
                    await passField.press('Backspace');
                    await passField.type(password, { delay: 100 });
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            await page.keyboard.press('Enter');
        }

        // ================= FREECHARGE FLOW (1000000% FIX) =================
        else if (walletName.includes('freecharge')) {
            console.log("[+] Opening Freecharge homepage...");
            try {
                await page.goto('https://www.freecharge.in/', { waitUntil: 'networkidle2', timeout: 35000 });
            } catch (e) {
                return res.status(400).json({ success: false, message: "Freecharge connection slow. Please try again." });
            }
            await new Promise(r => setTimeout(r, 3000)); 

            // Physical click on main login button
            try {
                const loginBox = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('a, button, span, div'));
                    const loginBtn = btns.find(e => e.innerText && (e.innerText.trim().toLowerCase() === 'login' || e.innerText.trim().toLowerCase() === 'login/register') && e.getBoundingClientRect().width > 0);
                    if (loginBtn) {
                        const rect = loginBtn.getBoundingClientRect();
                        return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
                    }
                    return null;
                });
                if(loginBox) await page.mouse.click(loginBox.x, loginBox.y);
            } catch(e) {}

            await new Promise(r => setTimeout(r, 4000));

            let targetFrame = null;
            let inputField = null;

            for (let attempt = 0; attempt < 10; attempt++) {
                let frames = [];
                try { frames = page.frames(); } catch(e) { frames = [page]; }
                for (let frame of frames) {
                    try {
                        if (frame.isDetached()) continue;
                        let inputs = await frame.$$('input:not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                let ph = await frame.evaluate(e => e.placeholder || '', el).then(p => p.toLowerCase());
                                if (ph.includes('mobile') || ph.includes('phone') || ph.includes('number')) {
                                    inputField = el; targetFrame = frame; break;
                                }
                            }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (inputField) {
                try {
                    await inputField.focus();
                    await inputField.click({ clickCount: 3 });
                    await inputField.press('Backspace');
                    
                    // Typing slowly like human
                    await page.keyboard.type(phone, { delay: 180 });
                    
                    // 🔴 BRAHMASTRA: React JS State Hacker 🔴
                    // Ye Freecharge ke system ko dhokha dega ki insaan ne sach mein type kiya hai
                    await targetFrame.evaluate((el) => {
                        let tracker = el._valueTracker;
                        if (tracker) tracker.setValue('');
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.blur();
                    }, inputField);
                } catch(e) {}
            } else {
                try { await page.keyboard.type(phone, { delay: 180 }); } catch(e){}
            }

            await new Promise(r => setTimeout(r, 2000));

            let otpClicked = false;
            try {
                if (targetFrame) {
                    // Physical Mouse move and click on OTP button
                    const btnBox = await targetFrame.evaluate(() => {
                        const els = Array.from(document.querySelectorAll('button, span, div, a'));
                        const btn = els.find(e => e.innerText && (e.innerText.toUpperCase().includes('OTP') || e.innerText.toUpperCase().includes('CONTINUE')) && e.getBoundingClientRect().width > 0);
                        if (btn) {
                            const rect = btn.getBoundingClientRect();
                            return { x: rect.x + rect.width/2, y: rect.y + rect.height/2 };
                        }
                        return null;
                    });
                    
                    if (btnBox) {
                        await page.mouse.move(btnBox.x, btnBox.y, { steps: 5 });
                        await page.mouse.click(btnBox.x, btnBox.y);
                        otpClicked = true;
                    }
                }
            } catch(e){}

            // Agar mouse click fail hua toh Enter maro
            if (!otpClicked) {
                try { await page.keyboard.press('Enter'); } catch(e){}
            }
            
            console.log("[+] Freecharge OTP request triggered (Physical Click + React Bypass).");
        }

        // ================= MOBIKWIK FLOW =================
        else if (walletName.includes('mobikwik')) {
            console.log("[+] Opening MobiKwik Homepage...");
            try {
                await page.goto('https://www.mobikwik.com/', { waitUntil: 'domcontentloaded', timeout: 35000 });
            } catch (e) {
                return res.status(400).json({ success: false, message: "MobiKwik server slow. Try again." });
            }
            
            let loginClicked = false;
            for (let i = 0; i < 15; i++) {
                try {
                    loginClicked = await page.evaluate(() => {
                        const els = Array.from(document.querySelectorAll('a, span, div, button, p'));
                        const btn = els.find(e => e.innerText && e.innerText.trim() === 'Login' && e.getBoundingClientRect().width > 0);
                        if (btn) { btn.click(); return true; }
                        return false;
                    });
                } catch(e){}
                if (loginClicked) break;
                await new Promise(r => setTimeout(r, 300));
            }

            if (!loginClicked) { try { await page.mouse.click(1250, 25); } catch(e){} }
            await new Promise(r => setTimeout(r, 3000));

            let typed = false;
            try {
                const allInputs = await page.$$('input');
                for (let i = allInputs.length - 1; i >= 0; i--) {
                    let inp = allInputs[i];
                    try {
                        let box = await inp.boundingBox();
                        if (box && box.width > 0 && box.height > 0) {
                            await inp.click();
                            await inp.focus();
                            await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
                            await page.keyboard.type(phone, { delay: 100 });
                            let val = await page.evaluate(el => el.value, inp);
                            if (val && val.length >= 2) { typed = true; break; }
                        }
                    } catch(e) {}
                }
            } catch(e) {}

            if (!typed) { try { await page.keyboard.type(phone, { delay: 100 }); } catch(e){} }
            await new Promise(r => setTimeout(r, 1000));

            try {
                let otpClicked = await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, span, div, a'));
                    const otpBtn = btns.find(b => b.innerText && (b.innerText.toUpperCase().includes('GET OTP') || b.innerText.toUpperCase().includes('SEND OTP')) && b.getBoundingClientRect().width > 0);
                    if (otpBtn) { otpBtn.click(); return true; }
                    return false;
                });
                if (!otpClicked) await page.keyboard.press('Enter');
            } catch(e){}
            await new Promise(r => setTimeout(r, 4000));
        }

        // ================= PHONEPE BUSINESS FLOW =================
        else if (walletName.includes('phonepe')) {
            console.log("[+] Opening PhonePe Business login page...");
            try {
                await page.goto('https://business.phonepe.com/login', { waitUntil: 'domcontentloaded', timeout: 35000 });
            } catch (e) {
                return res.status(400).json({ success: false, message: "PhonePe server slow. Try again." });
            }
            await new Promise(r => setTimeout(r, 3000)); 

            let inputCoords = null;
            try {
                inputCoords = await page.evaluate(() => {
                    const inputs = Array.from(document.querySelectorAll('input'));
                    const target = inputs.find(inp => {
                        let p = (inp.getAttribute('placeholder') || '').toLowerCase();
                        let t = (inp.getAttribute('type') || '').toLowerCase();
                        return (p.includes('mobile') || t === 'tel' || t === 'text') && inp.getBoundingClientRect().width > 0;
                    });
                    if (target) {
                        const rect = target.getBoundingClientRect();
                        return { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) };
                    }
                    return null;
                });
            } catch(e){}

            if (inputCoords) {
                try {
                    await page.mouse.click(inputCoords.x, inputCoords.y, { clickCount: 3 });
                    await page.keyboard.press('Backspace');
                    await page.keyboard.type(phone, { delay: 100 }); 
                } catch(e){}
            } else {
                try {
                    await page.evaluate((num) => {
                        const inputs = document.querySelectorAll('input');
                        for (let inp of inputs) {
                            if (inp.offsetParent !== null) {
                                inp.focus(); inp.value = num;
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                                return true;
                            }
                        }
                    }, phone);
                } catch(e){}
            }

            await new Promise(r => setTimeout(r, 1000));

            let otpCoords = null;
            try {
                otpCoords = await page.evaluate(() => {
                    const els = Array.from(document.querySelectorAll('button, span, div, a'));
                    const btn = els.find(e => e.innerText && (e.innerText.toUpperCase().includes('OTP') || e.innerText.toUpperCase().includes('LOGIN') || e.innerText.toUpperCase().includes('CONTINUE')) && e.getBoundingClientRect().width > 0);
                    if (btn) {
                        const rect = btn.getBoundingClientRect();
                        return { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) };
                    }
                    return null;
                });
            } catch(e){}

            try {
                if (otpCoords) await page.mouse.click(otpCoords.x, otpCoords.y);
                else await page.keyboard.press('Enter');
            } catch(e){}
        }
        
        res.json({ success: true, message: `OTP request sent for ${phone}` });

    } catch (error) {
        console.error(`❌ Error in send-otp:`, error);
        res.status(500).json({ success: false, message: "Network Error.", error: error.message });
    }
});

// ============================================================================
// ============================================================================
// 2. API: VERIFY OTP (SERVER/NETWORK VALIDATION)
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp } = req.body;
    keepSessionAlive(); 

    if (!page) return res.status(400).json({ success: false, message: "Browser session not active." });

    try {
        console.log(`[+] Injecting OTP: ${otp}`);
        
        let frames = [];
        try { frames = [page, ...page.frames()]; } catch(e) { frames = [page]; }
        
        let otpTyped = false;
        let interceptedUpi = "";
        let isOtpApiFailed = false;

        const networkListener = async (response) => {
            try {
                const req = response.request();
                if (req.method() === 'OPTIONS') return;

                const url = response.url().toLowerCase();
                const type = req.resourceType();

                if (type === 'xhr' || type === 'fetch') {
                    const text = await response.text();
                    
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|freecharge|icici|ybl|axl|oksbi|apypaytm|mobikwik|ikwik|upi|ptsbi)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) {
                        interceptedUpi = match[0];
                        console.log(`[+] API Sniffed UPI ID: ${interceptedUpi}`);
                    }

                    if (url.includes('verify') || url.includes('login') || url.includes('auth') || url.includes('otp')) {
                        if (response.status() >= 400) {
                            isOtpApiFailed = true;
                        } else {
                            const textLower = text.toLowerCase();
                            if (textLower.includes('"success":false') || 
                                textLower.includes('invalid otp') || 
                                textLower.includes('incorrect otp') || 
                                textLower.includes('wrong otp') ||
                                textLower.includes('invalid verification')) {
                                isOtpApiFailed = true;
                            }
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
                        await el.focus();
                        await el.click({ clickCount: 3 });
                        await el.press('Backspace');
                        await el.type(otp, { delay: 60 });
                        otpTyped = true;
                        break;
                    }
                }
            } catch (e) {}
            if (otpTyped) break;
        }

        if (!otpTyped) {
            try { await page.keyboard.type(otp, { delay: 60 }); } catch(e){}
        }

        await new Promise(r => setTimeout(r, 500));
        try { await page.keyboard.press('Enter'); } catch(e){}

        console.log("[+] Awaiting API verification (4 seconds)...");
        await new Promise(r => setTimeout(r, 4000)); 
        await dismissPopups(page);

        if (isOtpApiFailed) {
            console.log("❌ WRONG OTP DETECTED via Network Interception.");
            return res.status(400).json({ success: false, message: "Invalid OTP! Please try again." });
        }

        let currentUrl = "";
        try { currentUrl = page.url() || ""; } catch(e) { currentUrl = currentWallet; }

        const isFreecharge = currentUrl.includes('freecharge') || currentWallet.includes('freecharge');
        const isMobikwik = currentUrl.includes('mobikwik') || currentWallet.includes('mobikwik');
        const isPhonepe = currentUrl.includes('phonepe') || currentWallet.includes('phonepe');

        let finalUpi = "";

        if (isFreecharge) {
            finalUpi = `${currentPhone}@freecharge`;
        } else if (isMobikwik) {
            finalUpi = `${currentPhone}@ikwik`; 
        } else if (isPhonepe) {
            finalUpi = `${currentPhone}@ybl`; 
        } else {
            try {
                if (currentUrl.includes('paytm')) {
                    console.log("[+] Loading Paytm QR details page... (Waiting 5 seconds for React to load)");
                    await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'networkidle2', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 5000)); 
                }
            } catch(navErr) {
                console.log("[Error] Navigation to QR details timeout.");
            }

            console.log("[+] Deep Scanning HTML Source for UPI ID...");

            for (let i = 0; i < 15; i++) {
                if (interceptedUpi) {
                    finalUpi = interceptedUpi;
                    break;
                }

                try {
                    finalUpi = await page.evaluate(() => {
                        const htmlContent = document.documentElement.innerHTML;
                        const regex = /[a-zA-Z0-9.\-_]{3,}@(paytm|paytmpty|pty|paytmqr)/i;
                        const match = htmlContent.match(regex);
                        if (match) return match[0];
                        return "";
                    });
                } catch(e) {}

                if (finalUpi) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            
            // 🔴 ERROR FIX: Agar UPI na mile toh app mein seedha TRY AGAIN dikhayega! (Koi dummy code nahi)
            if (!finalUpi || finalUpi.trim() === "") {
                console.log("❌ Extracted nothing! Sending failure message to app.");
                return res.status(400).json({ success: false, message: "UPI Extraction Failed. Please Retry / Re-Verify." });
            }
        }

        console.log(`[+] Authentication complete. Extracted UPI: ${finalUpi}`);
        res.json({ 
            success: true, 
            message: "Account Successfully Linked!", 
            upi_id: finalUpi,
            mobile: currentPhone 
        });

    } catch (error) {
        console.error("❌ Catch error in verify-otp:", error.message);
        res.status(500).json({ success: false, message: "Validation Process Failed." });
    }
});

// ============================================================================
// 3. API: VERIFY UTR
// ============================================================================
app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr } = req.body;
    keepSessionAlive(); 
    
    if (!page) return res.status(400).json({ success: false, message: "Browser session not active." });
    if (!utr) return res.status(400).json({ success: false, message: "UTR missing." });

    try {
        console.log(`[+] Verifying UTR: ${utr}...`);
        
        let currentUrl = "";
        try { currentUrl = page.url() || ""; } catch(e){}
        
        try {
            if (currentUrl.includes('freecharge') || currentWallet.includes('freecharge')) {
                await page.goto('https://www.freecharge.in/desktop/app/transactions', { waitUntil: 'domcontentloaded', timeout: 45000 });
            } else if (currentUrl.includes('mobikwik') || currentWallet.includes('mobikwik')) {
                await page.goto('https://www.mobikwik.com/history', { waitUntil: 'domcontentloaded', timeout: 45000 });
            } else if (currentUrl.includes('phonepe') || currentWallet.includes('phonepe')) {
                await page.goto('https://business.phonepe.com/transactions', { waitUntil: 'domcontentloaded', timeout: 45000 });
            } else {
                await page.goto('https://dashboard.paytm.com/next/passbook', { waitUntil: 'domcontentloaded', timeout: 45000 });
            }
        } catch(navErr) {}

        await new Promise(r => setTimeout(r, 4000));
        await dismissPopups(page);

        let isFound = false;
        try {
            isFound = await page.evaluate((searchUtr) => {
                const bodyText = document.body.innerText.replace(/\s+/g, '');
                return bodyText.includes(searchUtr);
            }, utr.trim());
        } catch(e) {}

        if (isFound) {
            res.json({ success: true, message: "Payment Verified Successfully!", utr: utr });
        } else {
            res.json({ success: false, message: "UTR Not Found." });
        }

    } catch (error) {
        console.error("❌ Error verifying UTR:", error);
        res.status(500).json({ success: false, message: "UTR Verification process failed.", error: error.message });
    }
});

// ================= ERROR HANDLERS =================
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: "Invalid API Endpoint." });
});

app.use((err, req, res, next) => {
    res.status(500).json({ success: false, message: "Internal Server Error.", error: err.message });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BlackPay Server running on port ${PORT}`);
});
