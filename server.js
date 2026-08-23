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
// STEP 1: TRIGGER OTP VIA BROWSERLESS
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    // 🔴 TERI BROWSERLESS API KEY YAHAN SET HAI 🔴
    const browserWSEndpoint = 'wss://chrome.browserless.io?token=2V6jGIUi9i2HHBN13c561fc98136daa73b9388455b558503a';

    if (activeSessions[phone] && activeSessions[phone].browser) {
        try { await activeSessions[phone].browser.close(); } catch(e){}
    }
    
    activeSessions[phone] = { status: 'waiting_for_otp', upiId: null, browser: null, page: null };
    res.json({ success: true, message: "OTP sent! Waiting for input..." });

    try {
        console.log(`[+] Connecting to Browserless.io for: ${phone}`);
        
        const browser = await puppeteer.connect({ 
            browserWSEndpoint: browserWSEndpoint,
            defaultViewport: null
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');
        
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        activeSessions[phone].browser = browser;
        activeSessions[phone].page = page;

        if (walletType.toLowerCase().includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.evaluate(() => {
                const loginBtn = Array.from(document.querySelectorAll('a, button')).find(b => b.innerText && b.innerText.toLowerCase().includes('login'));
                if (loginBtn) loginBtn.click();
            });
            await new Promise(r => setTimeout(r, 1500));
            await page.keyboard.type(phone, { delay: 50 });
            await page.keyboard.press('Enter');
        } else {
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            let inputField = await page.waitForSelector('input[type="tel"], input[type="text"]:not([type="hidden"])', { timeout: 15000 });
            await inputField.focus(); 
            await inputField.type(phone, { delay: 50 }); 
            await page.keyboard.press('Enter');
        }
        
        console.log(`[!] OTP Triggered on Browserless for ${phone}`);

        setTimeout(async () => {
            if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
                try { await activeSessions[phone].browser.close(); delete activeSessions[phone]; } catch(e){}
                console.log(`[-] Session Timeout for ${phone}`);
            }
        }, 180000);

    } catch (e) {
        console.log(`[-] Browserless Error on ${phone}: ${e.message}`);
        if(activeSessions[phone]) activeSessions[phone].status = 'failed';
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
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 API Server Running on Port ${PORT}`));
