require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. MONGODB DATABASE CONNECTION (Tera safe hai)
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Database Connected!'))
  .catch((err) => console.log('❌ Database Connection Error:', err));

// ==========================================
// 2. 🔥 RAPID-API UPI NAME FETCHER JUGAD 🔥
// ==========================================
app.post('/api/verify-upi', async (req, res) => {
    // Flutter se aane wala data
    const { upi_id, wallet_type, mobile_number } = req.body;

    if (!upi_id || !upi_id.includes('@')) {
        return res.json({ success: false, message: "Invalid UPI ID Format" });
    }

    try {
        console.log(`Scanning UPI: ${upi_id} for Wallet: ${wallet_type}`);

        // 🔥 TERI RAPID API KI SETTING YAHAN HAI 🔥
        const options = {
            method: 'GET',
            // Dhyan de: Agar url error de, toh apni screen ke right side 'Code Snippet' me se exact url copy karlena
            url: 'https://upi-verification-vpa-upi-qr-code-generation.p.rapidapi.com/api/v1/upi/verify', 
            params: { vpa: upi_id },
            headers: {
                'X-RapidAPI-Key': 'b322713ddcmsha93f34085b060c4p152d87jsne64b0da637ad', // Teri Key!
                'X-RapidAPI-Host': 'upi-verification-vpa-upi-qr-code-generation.p.rapidapi.com'
            }
        };

        const rapidResponse = await axios.request(options);
        console.log("RapidAPI Success Response:", rapidResponse.data);

        // API alag-alag naam bhej sakti hai, hum sab check karenge
        const responseData = rapidResponse.data;
        const realName = responseData.name || responseData.customer_name || responseData.clientName || (responseData.data && responseData.data.name);

        if (realName) {
            console.log(`✅ Asli Naam Mil Gaya: ${realName}`);

            // Yahan tu chahe toh apna User.findOneAndUpdate wala code wapas laga sakta hai (Data save karne ke liye)

            return res.json({
                success: true,
                customer_name: realName, // Yeh seedha app ki screen par jayega
                vpa: upi_id
            });
        } else {
            return res.json({ success: false, message: "UPI ID Invalid ya Name fetch nahi hua" });
        }

    } catch (error) {
        console.error("❌ RapidAPI Error:", error.response ? error.response.data : error.message);
        return res.json({ success: false, message: "Bank se verify karne me fail hua!" });
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 BlackPay Engine running on port ${PORT}`);
});
