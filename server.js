const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs'); 
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

let browser;
let page;

console.log("🔥 BlackPay FULLY AUTOMATED Server Active (Master Edition with @pty Support)...");

async function dismissPopups(page) {
    try {
        await page.evaluate(() => {
            const elements = document.querySelectorAll('button, div, span, a, i');
            elements.forEach(el => {
                const text = el.innerText ? el.innerText.toUpperCase() : '';
                if (text.includes('CLOSE') || text === 'X' || el.className.includes('close')) el.click();
            });
        });
    } catch (e) {}
}

// ---------------- 1. AUTOMATED SEND OTP (Session Destroyer) ----------------
app.post('/api/wallet/send-otp', async (req, res) => {
    const { phone, password, walletType } = req.body; 

    if (browser) {
        try { await browser.close(); } catch(e) {}
    }

    try {
        let walletName = walletType.toLowerCase();
        console.log(`\n[+] New Login Request -> Phone: ${phone} | Wallet: ${walletName.toUpperCase()}`);
        
        const sessionDir = path.join(__dirname, 'sessions', `paytm_${phone}`);
        if (fs.existsSync(sessionDir)) {
            console.log(`[!] Purana session delete kar rahe hain...`);
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        
        browser = await puppeteer.launch({ 
            headless: false, 
            defaultViewport: null,
            userDataDir: sessionDir,
            ignoreDefaultArgs: ['--enable-automation'],
            args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--disable-web-security']
        }); 
        
        page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'media'].includes(req.resourceType())) { req.abort(); } 
            else { req.continue(); }
        });

        if (walletName === 'paytm' || walletName === 'paytm business') {
            console.log("[+] Opening Paytm Business login page...");
            await page.goto('https://dashboard.paytm.com/login/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            let targetFrame = null;
            let inputField = null;

            console.log("[+] Searching for input field...");
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
                return res.status(400).json({ success: false, message: "Paytm page load nahi hua, kripya dobara try karen." });
            }

            console.log("[+] Entering mobile number...");
            await inputField.focus();
            await inputField.click({ clickCount: 3 }); 
            await inputField.press('Backspace');       
            await inputField.type(phone, { delay: 100 }); 
            await new Promise(r => setTimeout(r, 1000));

            console.log("[+] Pressing Enter to Proceed...");
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 3000));

            if (password) {
                let passField = null;
                let passFrame = null;

                for (let frame of page.frames()) {
                    try {
                        let fields = await frame.$$('input[type="password"]');
                        for (let el of fields) {
                            let box = await el.boundingBox();
                            if (box && box.width > 0 && box.height > 0) {
                                passField = el;
                                passFrame = frame;
                                break;
                            }
                        }
                    } catch (e) {}
                    if (passField) break;
                }

                if (passField) {
                    console.log("[+] Entering password...");
                    await passField.focus();
                    await passField.click({ clickCount: 3 });
                    await passField.press('Backspace');
                    await passField.type(password, { delay: 100 });
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            console.log("[+] Pressing Enter for Final Sign In...");
            await page.keyboard.press('Enter');
            
            setTimeout(async () => {
                for (let frame of page.frames()) {
                    try {
                        await frame.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button, div[role="button"], span'));
                            const btn = btns.find(b => {
                                let txt = b.innerText ? b.innerText.toUpperCase() : '';
                                return txt.includes('SIGN IN') || txt.includes('SECURELY');
                            });
                            if (btn) btn.click();
                        });
                    } catch (e) {}
                }
            }, 1000);
        }

        res.json({ success: true, message: `OTP sent successfully!` });
    } catch (error) {
        console.error(`❌ Error in send-otp:`, error);
        res.status(500).json({ success: false, message: "Server timeout.", error: error.message });
    }
});

// ---------------- 2. VERIFY OTP & MASTER UPI SNIFFER (@pty SUPPORT) ----------------
app.post('/api/wallet/verify-otp', async (req, res) => {
    const { otp } = req.body;
    if (!page) return res.status(400).json({ success: false, message: "Browser nahi khula!" });
    if (!otp || otp.trim().length < 6) return res.status(400).json({ success: false, message: "Valid 6-digit OTP required!" });

    try {
        console.log(`\n[+] Verifying Client OTP: ${otp}`);
        
        let frames = [page, ...page.frames()];
        let otpTyped = false;

        let interceptedUpi = "";
        page.on('response', async (response) => {
            try {
                if (response.request().resourceType() === 'xhr' || response.request().resourceType() === 'fetch') {
                    const text = await response.text();
                    // 🔴 UPDATED REGEX: @pty aur @paytmpty included
                    const upiRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|icici|ybl|axl|oksbi|apypaytm|upi|ptsbi)/i;
                    const match = text.match(upiRegex);
                    if (match && !interceptedUpi) {
                        interceptedUpi = match[0];
                        console.log(`[🔥 API SNIFFER] Network se asli UPI pakad li: ${interceptedUpi}`);
                    }
                }
            } catch(e) {} 
        });
        
        for (let frame of frames) {
            try {
                let inputs = await frame.$$('input:not([type="hidden"])');
                for (let el of inputs) {
                    let box = await el.boundingBox();
                    if (box && box.width > 0 && box.height > 0) {
                        console.log("[+] Entering OTP natively...");
                        await el.focus();
                        await el.click({ clickCount: 3 });
                        await el.press('Backspace');
                        await el.type(otp, { delay: 100 });
                        otpTyped = true;
                        break;
                    }
                }
            } catch (e) {}
            if (otpTyped) break;
        }

        if (!otpTyped) {
            await page.keyboard.type(otp, { delay: 100 });
        }

        await new Promise(r => setTimeout(r, 500));
        console.log("[+] Pressing Enter to Submit OTP...");
        await page.keyboard.press('Enter');

        console.log("[+] Waiting for login and dashboard to settle... (8 Seconds)");
        await new Promise(r => setTimeout(r, 8000)); 
        await dismissPopups(page);

        console.log("[+] Going to qr-details page...");
        try {
            await page.goto('https://dashboard.paytm.com/next/qr-details', { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch(navErr) {
            console.log("[-] Navigation normal wait timeout, moving to scrape anyway...");
        }
        
        try { await page.evaluate(() => window.scrollBy(0, 500)); } catch(e){}

        console.log("[+] Hunting for OG UPI ID with MASTER SCANNER (15 Seconds Loop)...");
        let finalUpi = "";

        for (let i = 0; i < 15; i++) {
            if (interceptedUpi) {
                finalUpi = interceptedUpi;
                console.log(`[+] SUCCESS! Got UPI from Network API!`);
                break;
            }

            // 🔴 MASTER SCREEN SCANNER (Targeting @pty, @paytmpty, etc.)
            finalUpi = await page.evaluate(() => {
                let rawHtmlText = document.body.innerText.replace(/\s+/g, '').replace(/\n/g, ''); 
                let exactDomainRegex = /[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|icici|ybl|axl|oksbi|apypaytm|upi|ptsbi)/i;
                let match = rawHtmlText.match(exactDomainRegex);
                if (match) return match[0];

                const inputs = document.querySelectorAll('input');
                for (let input of inputs) {
                    if(input.value && input.value.includes('@')) {
                        let m = input.value.match(exactDomainRegex);
                        if (m) return m[0];
                    }
                }

                const elements = document.querySelectorAll('span, div, p, strong, b');
                for (let el of elements) {
                    let txt = el.innerText ? el.innerText.trim() : '';
                    if (txt.includes('@')) {
                        let m = txt.match(/[a-zA-Z0-9.\-_]{3,}@(pty|paytmpty|paytm|paytmqr|icici|ybl|axl|oksbi)/i);
                        if (m) return m[0];
                    }
                }
                return "";
            });

            if (finalUpi) {
                console.log(`[+] SUCCESS! Scraped OG UPI from Screen at attempt ${i + 1}`);
                break;
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`[+] Final Scraped UPI: ${finalUpi || "Nahi mili!"}`);

        if (!finalUpi) {
            return res.status(400).json({ success: false, message: "Login successful but UPI not found. Make sure QR code is visible." });
        }

        res.json({ success: true, message: "Account Bound Successfully!", upi_id: finalUpi });

    } catch (error) {
        console.error("❌ OTP Error:", error);
        res.status(500).json({ success: false, message: "OTP verification failed.", error: error.message });
    }
});

app.listen(3000, '0.0.0.0', () => { 
    console.log(`🚀 Master Server running on port 3000`); 
});
