const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const FAST2SMS_API_KEY = "dl51mufyW8oVtTEzHYnKXIUjx6GSMFDCR93JBObN40saehLqkvG5HnUSwa6mIzVDYso8p7AWhEQJNXPc";

app.get('/', (req, res) => {
    res.json({ success: true, message: "BlackPay Uono-Hub Core Server is Live!" });
});

// ==========================================
// 1. UONO HUB: ACCOUNTS & RECEIVABLES (ar module)
// ==========================================
app.get('/next/micro/ar/all-customers', (req, res) => {
    res.json({ success: true, module: "AR Receivables", data: [] });
});

app.post('/next/micro/ar/credit-notes/create', (req, res) => {
    res.json({ success: true, message: "Credit Note Created Successfully" });
});

// ==========================================
// 2. UONO HUB: PAYMENTS & COMS (coms module)
// ==========================================
app.get('/next/micro/coms/contacts', (req, res) => {
    res.json({ success: true, module: "Contacts List", contacts: [] });
});

app.get('/next/micro/coms/payouts-reports', (req, res) => {
    res.json({ success: true, module: "Payouts Reports", reports: [] });
});

// ==========================================
// 3. UONO HUB: ACCOUNTS PAYABLE (ap module)
// ==========================================
app.get('/next/micro/ap/expenses', (req, res) => {
    res.json({ success: true, module: "AP Expenses", expenses: [] });
});

app.post('/next/micro/ap/vendor-invoices/add-invoice', (req, res) => {
    res.json({ success: true, message: "Vendor Invoice Added" });
});

// ==========================================
// 4. UONO HUB: APPROVALS & CA (ca module)
// ==========================================
app.get('/next/micro/ca/approvals', (req, res) => {
    res.json({ success: true, module: "Custom Approvals", pending: [] });
});

// ==========================================
// 5. UONO HUB: DISBURSAL & WALLET (disbursal module)
// ==========================================
app.get('/next/micro/disbursal/disbursal', (req, res) => {
    res.json({ success: true, module: "Disbursal Hub Active", balance: 0.00 });
});

// FAST SMS GATEWAY ROUTE
app.post('/api/send-sms', async (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Missing data." });
    
    const msg = encodeURIComponent(`Your Verification Code is ${otp} [id:ufrgjfruafhs]`);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=q&message=${msg}&language=english&flash=0&numbers=${phone}`;
    
    try {
        const response = await axios.get(url);
        if (response.data.return === true) {
            res.json({ success: true, message: "OTP Sent Successfully!" });
        } else {
            res.status(400).json({ success: false, message: "SMS Error" });
        }
    } catch (e) {
        res.status(500).json({ success: false, message: "Server SMS Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 BlackPay Uono-Hub Backend Running on Port ${PORT}`); 
});
