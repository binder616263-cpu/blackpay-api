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
    const { upi_id, wallet_type } = req.body;

    if (!upi_id) {
        return res.json({ success: false, message: "Number khali hai!" });
    }

    // Phone Number nikalna (Agar user galti se @paytm daal de toh bhi sirf number aayega)
    let phoneNumber = upi_id.includes('@') ? upi_id.split('@')[0] : upi_id;

    try {
        console.log(`Scanning Phone Number: ${phoneNumber} for Wallet: ${wallet_type}`);

        // ========================================================
        // 🚨 RAPID API CONFIGURATION 🚨
        // ========================================================
        const options = {
            method: 'GET',
            // Teri photo me URL nahi dikha, toh maine guess karke dala hai.
            // Agar chalne me error aaye, toh RapidAPI se 'Request URL' copy karke yahan daal dena.
            url: 'https://number-to-all-upi.p.rapidapi.com/get_upi_ids', 
            params: { 
                number: phoneNumber 
            },
            headers: {
                'X-RapidAPI-Key': 'b322713ddcmsha93f34085b060c4p152d87jsne64b0da637ad', 
                'X-RapidAPI-Host': 'number-to-all-upi.p.rapidapi.com' 
            }
        };

        const rapidResponse = await axios.request(options);
        const data = rapidResponse.data;

        // Tera photo wala JSON format check kar raha hu (data.vpas)
        if (data && data.vpas && data.vpas.length > 0) {
            
            // Asli naam nikal lo (Pehli entry best hoti hai)
            const realName = data.vpas[0].name;

            console.log(`✅ Asli Naam Mil Gaya: ${realName}`);
            
            return res.json({ 
                success: true, 
                customer_name: realName, 
                vpas: data.vpas // Saari list app ko bhej di
            });

        } else {
            return res.json({ success: false, message: "Is number se koi UPI link nahi hai!" });
        }

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("❌ RapidAPI Error:", errorMsg);
        return res.json({ success: false, message: `API Error: Please check Backend Logs or URL.` });
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 BlackPay Engine running on port ${PORT}`);
});
