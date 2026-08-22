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
    res.json({ success: true, message: "BlackPay Server is Live & Running!" });
});

let browser;
let page;
let currentPhone = "";
let currentWallet = "";

console.log("🔥 BlackPay Server Active (Smart UTR, Last 4-Digit & Paytm/Freecharge Fix)...");

// ============================================================================
// 0. SEND SMS VIA FAST2SMS
// ============================================================================
app.post('/api/send-sms', (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone or OTP missing." });

    const message = encodeURIComponent(`Your Verification Code is ${otp}`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=${message}&language=english&flash=0&numbers=${phone}`;

    https.get(url, (response) => {
        let data = ''; response.on('data', (chunk) => data += chunk);
        response.on('end', () => { res.json({ success: true, message: "OTP Sent Successfully!" }); });
    }).on("error", () => res.status(500).json({ success: false, message: "Server SMS Error" }));
});

async function dismissPopups(targetPage) {
    try {
        await targetPage.evaluate(() => {
            const elements = document.querySelectorAll('button, div, span, a, i');
            elements.forEach(el => {
                const text = el.innerText ? el.innerText.toUpperCase() : '';
                if (text.includes('CLOSE') || text === 'X' || el.className.includes('close')) el.click();
            });
        });
    } catch (e) {}
}

let interceptedUpi = ""; // Global sniffer memory

// ============================================================================
// 1. API: AUTOMATED SEND OTP
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 

    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid 10 digit number!" });

    if (browser) { try { await browser.close(); } catch(e) {} }

    try {
        let walletName = walletType ? walletType.toLowerCase().trim() : "";
        currentPhone = phone; currentWallet = walletName;
        interceptedUpi = ""; 

        console.log(`\n[+] New Login Request -> Phone: ${phone} | Wallet: ${walletName.toUpperCase()}`);
        
        browser = await puppeteer.launch({ 
            headless: true, 
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 🚀 NETWORK SNIFFER START
        page.on('response', async (response) => {
            if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
                try {
                    const text = await response.text();
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|freecharge|ikwik|ybl|axl|upi)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) { interceptedUpi = match[0]; console.log(`[🚀 SNIFFER CAUGHT UPI]: ${interceptedUpi}`); }
                } catch(e) {}
            }
        });

        // ================= PAYTM FLOW =================
        if (walletName.includes('paytm')) {
            console.log("[+] Opening Paytm login page...");
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            let inputField = null;
            for (let attempt = 0; attempt < 20; attempt++) {
                for (let frame of page.frames()) {
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
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!inputField) return res.status(400).json({ success: false, message: "Paytm page load failed." });

            await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 100 }); 
            await page.keyboard.press('Enter');

            if (password) {
                await new Promise(r => setTimeout(r, 2000));
                let passField = null;
                for (let frame of page.frames()) {
                    try {
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
                    await passField.type(password, { delay: 100 });
                }
            }
            await page.keyboard.press('Enter');
        }

        // ================= FREECHARGE FLOW (FIXED) =================
        else if (walletName.includes('freecharge')) {
            console.log("[+] Opening Freecharge homepage...");
            await page.goto('https://www.freecharge.in/', { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000)); 

            // Try to find and click Login/Register button first
            try {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('a, button, div, span'));
                    const loginBtn = btns.find(b => b.innerText && (b.innerText.trim().toLowerCase() === 'login/register' || b.innerText.trim().toLowerCase() === 'login'));
                    if (loginBtn) loginBtn.click();
                });
            } catch(e) {}
            await new Promise(r => setTimeout(r, 2000)); 

            // Hardcode click in center as fallback
            await page.mouse.click(1250, 40); 
            await new Promise(r => setTimeout(r, 1000));

            // Type phone
            try {
                await page.evaluate((ph) => {
                    const inps = document.querySelectorAll('input');
                    for (let i of inps) {
                        if (i.getBoundingClientRect().width > 0) {
                            i.focus(); i.value = ph; i.dispatchEvent(new Event('input', {bubbles: true}));
                        }
                    }
                }, phone);
            } catch(e) {}

            await page.keyboard.type(phone, { delay: 50 });
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');

            // Find GET OTP button
            try {
                await page.evaluate(() => {
                    const btns = Array.from(document.querySelectorAll('button, span, div, a'));
                    const otpBtn = btns.find(b => b.innerText && b.innerText.toUpperCase().includes('GET OTP') && b.getBoundingClientRect().width > 0);
                    if (otpBtn) otpBtn.click();
                });
            } catch(e) {}
            
            console.log("[+] OTP request triggered for Freecharge.");
        }

        // ================= MOBIKWIK FLOW =================
        else if (walletName.includes('mobikwik')) {
            await page.goto('https://www.mobikwik.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 2000));
            try {
                await page.evaluate(() => {
                    const btn = Array.from(document.querySelectorAll('a, button')).find(e => e.innerText && e.innerText.trim() === 'Login');
                    if (btn) btn.click();
                });
            } catch(e){}
            await new Promise(r => setTimeout(r, 2000));
            await page.keyboard.type(phone, { delay: 100 });
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
        }

        // ================= PHONEPE FLOW =================
        else if (walletName.includes('phonepe')) {
            await page.goto('https://business.phonepe.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000)); 
            await page.keyboard.type(phone, { delay: 100 });
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.press('Enter');
        }

        res.json({ success: true, message: `OTP request sent for ${phone}` });

    } catch (error) {
        console.error(`❌ Error in send-otp:`, error.message);
        res.status(500).json({ success: false, message: "Network slow. Try again." });
    }
});

// ============================================================================
// 2. API: VERIFY OTP (WITH OG UPI FINDER)
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body;
    if (!page) return res.status(400).json({ success: false, message: "Browser session expired. Relink." });

    try {
        console.log(`[+] Injecting OTP: ${otp}`);
        
        let frames = [page, ...page.frames()];
        let otpTyped = false;

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

        if (!otpTyped) await page.keyboard.type(otp, { delay: 60 });
        
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');

        console.log("[+] Waiting for Dashboard to load...");
        await new Promise(r => setTimeout(r, 6000)); 
        await dismissPopups(page);

        let finalUpi = interceptedUpi; // Pehle network sniffer memory check karo

        // 🔴 PAYTM OG UPI FORCE SCANNER
        if (currentWallet.includes('paytm')) {
            if (!finalUpi) {
                console.log("[+] Navigating to Paytm QR page to force load OG UPI...");
                try { await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch(e){}
                await new Promise(r => setTimeout(r, 5000));
                finalUpi = interceptedUpi; // Double check sniffer after reload
            }

            if (!finalUpi) {
                console.log("[+] Searching DOM & LocalStorage for UPI...");
                finalUpi = await page.evaluate(() => {
                    try {
                        const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i;
                        if (document && document.body) {
                            let textMatch = document.body.innerText.match(regex);
                            if (textMatch) return textMatch[0];
                        }
                        for (let j = 0; j < localStorage.length; j++) {
                            let val = localStorage.getItem(localStorage.key(j));
                            if (val && regex.test(val)) return val.match(regex)[0];
                        }
                        if (window.__PRELOADED_STATE__) {
                            let st = JSON.stringify(window.__PRELOADED_STATE__);
                            let sm = st.match(regex);
                            if (sm) return sm[0];
                        }
                        return "";
                    } catch (e) { return ""; }
                });
            }
            
            if (!finalUpi || finalUpi.trim() === "") {
                if (browser) { try { await browser.close(); } catch(e){} browser = null; }
                return res.status(400).json({ success: false, message: "OG UPI Extraction failed. Paytm account is blocked or incomplete." });
            }
        } 
        else if (currentWallet.includes('freecharge')) { finalUpi = `${currentPhone}@freecharge`; } 
        else if (currentWallet.includes('mobikwik')) { finalUpi = `${currentPhone}@ikwik`; } 
        else if (currentWallet.includes('phonepe')) { finalUpi = `${currentPhone}@ybl`; }

        console.log(`[✔] Authentication complete. OG UPI Extracted: ${finalUpi}`);
        if (browser) { try { await browser.close(); } catch(e){} browser = null; }
        
        res.json({ success: true, message: "Account Successfully Linked!", upi_id: finalUpi, mobile: currentPhone });

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
            let found = bodyText.includes(searchUtr);
            if (!found && searchAmt && searchLast4) {
                 if (bodyText.includes(searchAmt) && bodyText.includes(searchLast4)) { found = true; }
            }
            return found;
        }, utr.trim(), amount ? amount.toString() : "", last4 ? last4.toString() : "");

        if (isFound) {
            console.log(`[✔] Match Found! Auto-Approving Order.`);
            res.json({ success: true, message: "Payment Verified Successfully!", utr: utr });
        } else {
            console.log(`[!] Not Found automatically. Pushing to Pending/Manual.`);
            res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: utr });
        }

    } catch (error) {
        console.error("❌ Error verifying UTR:", error.message);
        res.json({ success: false, message: "Server busy, sent for manual review.", utr: utr });
    }
});

// ================= ERROR HANDLERS =================
app.use((req, res, next) => { res.status(404).json({ success: false, message: "Invalid API Endpoint." }); });
app.use((err, req, res, next) => { res.status(500).json({ success: false, message: "Internal Server Error." }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 BlackPay Premium Server running on port ${PORT}`); });
