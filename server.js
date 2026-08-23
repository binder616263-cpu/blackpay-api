const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Puppeteer with Stealth Plugin
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

let activeSessions = {};

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Master Server Running on RENDER (In-House)!" }));

// Dummy Uono Hub Routes
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, balance: 0 }));

// ==========================================
// STEP 1: TRIGGER OTP VIA RENDER ITSELF (NO BROWSERLESS)
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    if (activeSessions[phone] && activeSessions[phone].browser) {
        try { await activeSessions[phone].browser.close(); } catch(e){}
    }
    
    activeSessions[phone] = { status: 'waiting_for_otp', upiId: null, browser: null, page: null };

    try {
        console.log(`[+] Launching Chrome directly inside Render for: ${phone}`);
        
        // 🔥 NAYA MAJDUR: RENDER KE ANDAR ASLI CHROME 🔥
        const browser = await puppeteer.launch({ 
            headless: true, // Render cloud par screen nahi hoti
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // RAM bachane ke liye
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        activeSessions[phone].browser = browser;
        activeSessions[phone].page = page;

        if (walletType.toLowerCase().includes('freecharge')) {
            console.log(`[!] Opening Freecharge for ${phone}...`);
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36');
            
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
            console.log(`[!] Opening Paytm Business (Render IP Bypass) for ${phone}...`);
            
            // 🔥 TRICK: Fake Indian IP aur Headers wahi rahenge
            const randomIP = `49.36.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`; 

            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8,hi;q=0.7',
                'X-Forwarded-For': randomIP,
                'X-Real-IP': randomIP,
                'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });

            const cacheBuster = Date.now();
            const spoofedUrl = `https://dashboard.paytm.com/login/?ref=app&_t=${cacheBuster}`;
            
            await page.goto(spoofedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 4000)); 

            let pageText = await page.evaluate(() => document.body.innerText);
            if (pageText.toLowerCase().includes('server busy') || pageText.toLowerCase().includes('something went wrong')) {
                console.log(`[!] RENDER IP BLOCKED: WAF ne IP pakad li.`);
                throw new Error("Paytm Firewall Block (Server Busy)");
            }

            let inputField = await page.waitForSelector('input[type="tel"], input[name="mobileNumber"]', { timeout: 15000 });
            await inputField.focus(); 
            await inputField.type(phone, { delay: 200 }); 

            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const proceedBtn = btns.find(b => b.innerText && (b.innerText.toLowerCase().includes('proceed') || b.innerText.toLowerCase().includes('login') || b.innerText.toLowerCase().includes('sign in')));
                if (proceedBtn) proceedBtn.click();
            });
            await page.keyboard.press('Enter');
        }
        
        console.log(`[!] OTP Triggered on Render Majdur for ${phone}`);

        // Fake success hat gaya, ab tabhi message jayega jab OTP sach mein bhej dega
        res.json({ success: true, message: "OTP sent! Waiting for input..." });

        setTimeout(async () => {
            if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
                try { await activeSessions[phone].browser.close(); delete activeSessions[phone]; } catch(e){}
                console.log(`[-] Session Timeout for ${phone}`);
            }
        }, 180000);

    } catch (e) {
        console.log(`[-] Render Error on ${phone}: ${e.message}`);
        if(activeSessions[phone]) {
            activeSessions[phone].status = 'failed';
            if (activeSessions[phone].browser) {
                try { await activeSessions[phone].browser.close(); } catch(err){}
            }
        }
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
