const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Memory to hold Puppeteer sessions
let activeSessions = {};

app.get('/', (req, res) => res.json({ success: true, message: "BlackPay Master Server Running!" }));

// Dummy Uono Hub Routes
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, data: [] }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, contacts: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, expenses: [] }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, balance: 0 }));

// ==========================================
// STEP 1: TRIGGER OTP (Called from App)
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    // Clean up old session if exists
    if (activeSessions[phone] && activeSessions[phone].browser) {
        try { await activeSessions[phone].browser.close(); } catch(e){}
    }
    
    activeSessions[phone] = { status: 'waiting_for_otp', upiId: null, browser: null, page: null };
    res.json({ success: true, message: "OTP sent! Waiting for input..." });

    try {
        console.log(`[+] Triggering OTP for: ${phone} | Wallet: ${walletType}`);
        const browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36');
        
        // Fast loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        activeSessions[phone].browser = browser;
        activeSessions[phone].page = page;

        if (walletType.toLowerCase().includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => {
                const loginBtn = Array.from(document.querySelectorAll('a, button')).find(b => b.innerText && b.innerText.toLowerCase().includes('login'));
                if (loginBtn) loginBtn.click();
            });
            await new Promise(r => setTimeout(r, 1500));
            await page.keyboard.type(phone, { delay: 50 });
            await page.keyboard.press('Enter');
        } else {
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded' });
            let inputField = await page.waitForSelector('input[type="tel"], input[type="text"]:not([type="hidden"])', { timeout: 10000 });
            await inputField.focus(); 
            await inputField.type(phone, { delay: 50 }); 
            await page.keyboard.press('Enter');
        }
        
        // Auto-close session after 3 mins to save server memory
        setTimeout(async () => {
            if (activeSessions[phone] && activeSessions[phone].status === 'waiting_for_otp') {
                try { await activeSessions[phone].browser.close(); delete activeSessions[phone]; } catch(e){}
            }
        }, 180000);

    } catch (e) {
        console.log(`[-] Error on ${phone}: ${e.message}`);
        if(activeSessions[phone]) activeSessions[phone].status = 'failed';
    }
});

// ==========================================
// STEP 2: VERIFY OTP & GET UPI (Called from App)
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
            await new Promise(r => setTimeout(r, 5000)); // Wait for dashboard to load
            
            let upi = await page.evaluate(() => {
                try { return document.getElementsByClassName("account-label-texts")[1].parentElement.innerText; } 
                catch(e) { 
                    const match = document.body.innerText.match(/[a-zA-Z0-9.\-_]{3,}@(pty|paytm|freecharge|upi|ybl|ikwik)/i);
                    return match ? match[0] : "";
                }
            });

            if (!upi) upi = `${phone}@freecharge`; // Ultimate Fallback if DOM fails
            
            console.log(`[✔] Scraped UPI: ${upi}`);
            
            // Close Browser and return UPI
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 BlackPay Server Running on Port ${PORT}`));
