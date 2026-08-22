const express = require('express');
const cors = require('cors');
const axios = require('axios');

// ANTI-CAPTCHA STEALTH MODE
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay Uono-Hub Master Core Server is Live!" });
});

// ==========================================
// 1. UONO HUB MICRO-FRONTEND ROUTES (Webpack Mapped)
// ==========================================
app.get('/next/micro/ar/all-customers', (req, res) => res.json({ success: true, module: "AR Receivables", data: [] }));
app.post('/next/micro/ar/credit-notes/create', (req, res) => res.json({ success: true, message: "Credit Note Created" }));
app.get('/next/micro/coms/contacts', (req, res) => res.json({ success: true, module: "Contacts", contacts: [] }));
app.get('/next/micro/coms/payouts-reports', (req, res) => res.json({ success: true, module: "Payouts Reports", reports: [] }));
app.get('/next/micro/ap/expenses', (req, res) => res.json({ success: true, module: "AP Expenses", expenses: [] }));
app.post('/next/micro/ap/vendor-invoices/add-invoice', (req, res) => res.json({ success: true, message: "Invoice Added" }));
app.get('/next/micro/ca/approvals', (req, res) => res.json({ success: true, module: "Approvals", pending: [] }));
app.get('/next/micro/disbursal/disbursal', (req, res) => res.json({ success: true, module: "Disbursal Hub", balance: 0.00 }));

// ==========================================
// 2. FAST SMS GATEWAY (With Android Hash Support)
// ==========================================
app.post('/api/send-sms', async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Missing data." });
    
    // Hash tag added for 5-8 second fast background reading
    const msg = encodeURIComponent(`Your Verification Code is ${otp} [id:ufrgjfruafhs]`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=$msg&language=english&flash=0&numbers=${phone}`;
    
    try {
        const response = await axios.get(url);
        if (response.data.return === true) {
            res.json({ success: true, message: "OTP Sent Successfully!" });
        } else {
            res.status(400).json({ success: false, message: "SMS Gateway Error" });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: "Server SMS Error" });
    }
});

// ==========================================
// 3. PUPPETEER AUTOMATION (Fast Login & UPI Extraction)
// ==========================================
let browser;
let page;
let currentPhone = "";
let currentWallet = "";
let interceptedUpi = "";

app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 

    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Invalid number!" });
    if (browser) { try { await browser.close(); } catch(e) {} browser = null; }

    try {
        currentPhone = phone; 
        currentWallet = walletType ? walletType.toLowerCase().trim() : "paytm";
        interceptedUpi = ""; 
        console.log(`\n[+] Fast Bot Request -> Phone: ${phone} | Wallet: ${currentWallet.toUpperCase()}`);
        
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Block unnecessary resources for instant loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) { req.abort(); } 
            else { req.continue(); }
        });

        // Network sniffer to catch VPA/UPI payloads automatically
        page.on('response', async (response) => {
            if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
                try {
                    const text = await response.text();
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|freecharge|ikwik|ybl|axl|upi)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) { interceptedUpi = match[0]; console.log(`[✔ SNIFFER CAUGHT UPI]: ${interceptedUpi}`); }
                } catch(e) {}
            }
        });

        if (currentWallet.includes('paytm')) {
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
            let inputField = await page.waitForSelector('input[type="tel"], input[type="text"]:not([type="hidden"])', { timeout: 10000 });
            if (!inputField) return res.status(400).json({ success: false, message: "Server slow, try again." });

            await inputField.focus(); await inputField.click({ clickCount: 3 }); await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 20 }); 
            await page.keyboard.press('Enter');

            if (password) {
                let passField = await page.waitForSelector('input[type="password"]', { timeout: 5000 }).catch(()=>null);
                if (passField) { await passField.focus(); await passField.type(password, { delay: 20 }); }
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
            await page.keyboard.type(phone, { delay: 20 });
            await page.keyboard.press('Enter');
        } 
        else {
            let url = currentWallet.includes('phonepe') ? 'https://business.phonepe.com/login' : 'https://www.mobikwik.com/';
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await new Promise(r => setTimeout(r, 2000));
            await page.keyboard.type(phone, { delay: 20 });
            await page.keyboard.press('Enter');
        }

        res.json({ success: true, message: `OTP triggered for ${phone}` });

    } catch (error) {
        res.status(500).json({ success: false, message: "Network slow. Try again." });
    }
});

app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp, phone } = req.body; 
    if (!otp) return res.status(400).json({ success: false, message: "OTP missing." });
    if (!page) return res.status(400).json({ success: false, message: "Session expired. Relink." });

    try {
        await page.keyboard.type(otp, { delay: 20 });
        await page.keyboard.press('Enter');
        
        for(let i=0; i<6; i++) {
            if(interceptedUpi) break;
            await new Promise(r => setTimeout(r, 1000));
        }

        let finalUpi = interceptedUpi;
        if (!finalUpi && currentWallet.includes('paytm')) {
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
            return res.json({ success: true, message: "Account Bound!", upi_id: finalUpi, mobile: phone });
        } else {
            return res.status(400).json({ success: false, message: "Verification failed or incorrect OTP." });
        }
    } catch (error) { 
        if (browser) { try { await browser.close(); } catch(e){} browser = null; }
        res.status(500).json({ success: false, message: "Server Verification Error." }); 
    }
});

app.post('/api/wallet/verify-utr', async (req, res) => {
    res.json({ success: false, message: "Awaiting Manual Confirmation.", utr: req.body.utr });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 BlackPay Master Core Running on Port ${PORT}`); 
});
