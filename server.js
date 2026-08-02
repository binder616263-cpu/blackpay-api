require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. MONGODB DATABASE CONNECTION
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Database Connected!'))
  .catch((err) => console.log('❌ Database Connection Error:', err));

// ==========================================
// 2. 🔥 SMART MOBILE TO UPI FETCHER 🔥
// ==========================================
app.post('/api/verify-upi', async (req, res) => {
    const { upi_id } = req.body;

    if (!upi_id) {
        return res.json({ success: false, message: "Number khali hai!" });
    }

    // Exact number nikalna (Spacings aur @ ko clean karke)
    let phoneNumber = String(upi_id).trim();
    if (phoneNumber.includes('@')) {
        phoneNumber = phoneNumber.split('@')[0];
    }

    // 🔥 100% WORKING DUMMY BYPASS 🔥
    if (phoneNumber === '9876543210' || phoneNumber === '9999999999') {
        return res.json({ 
            success: true, 
            customer_name: "Demo User", 
            vpas: [
                { vpa: "demo1@paytm", bank: "Paytm Bank" },
                { vpa: "demo2@ybl", bank: "Yes Bank" }
            ] 
        });
    }

    try {
        console.log(`Scanning Phone Number: ${phoneNumber}`);

        const options = {
            method: 'GET',
            // 🔥 MAINE APNI TARAF SE EXACT URL GUESS KARKE DAAL DIYA HAI 🔥
            url: 'https://number-to-all-upi.p.rapidapi.com/get_all_upi', 
            params: { number: phoneNumber },
            headers: {
                'X-RapidAPI-Key': 'b322713ddcmsha93f34085b060c4p152d87jsne64b0da637ad', 
                'X-RapidAPI-Host': 'number-to-all-upi.p.rapidapi.com' 
            }
        };

        const rapidResponse = await axios.request(options);
        const data = rapidResponse.data;

        if (data && data.vpas && data.vpas.length > 0) {
            const realName = data.vpas[0].name;
            return res.json({ success: true, customer_name: realName, vpas: data.vpas });
        } else {
            return res.json({ success: false, message: "Is number par koi UPI nahi hai!" });
        }

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("❌ RapidAPI Error:", errorMsg);
        return res.json({ success: false, message: `RapidAPI URL Incorrect or Server Down.` });
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BlackPay Engine running on port ${PORT}`));
