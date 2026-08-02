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
        return res.json({ success: false, message: "UPI ID khali hai!" });
    }

    // 💡 TERA JUGAD: UPI ID mein se Phone Number nikalna (e.g. 8191010202@paytm -> 8191010202)
    let phoneNumber = upi_id;
    if (upi_id.includes('@')) {
        phoneNumber = upi_id.split('@')[0]; 
    }

    try {
        console.log(`Scanning Phone Number: ${phoneNumber} for Wallet: ${wallet_type}`);

        // ========================================================
        // 🚨 YAHAN APNI RAPID API KI DETAILS DAAL 🚨
        // ========================================================
        const options = {
            method: 'GET',
            // Teri nayi "Number To All UPI" API ka URL yahan daal (Right side Code Snippet se copy kar)
            url: 'YAHAN_RAPID_API_KA_URL_DAAL_DENA', 
            params: { 
                number: phoneNumber // 🔥 Nayi API ko 'number' chahiye, wo humne de diya!
            },
            headers: {
                'X-RapidAPI-Key': 'b322713ddcmsha93f34085b060c4p152d87jsne64b0da637ad', // Teri working Key
                // Yahan is API ka Host name daal (Right side Code Snippet se copy kar)
                'X-RapidAPI-Host': 'YAHAN_RAPID_API_HOST_DAAL_DENA' 
            }
        };

        const rapidResponse = await axios.request(options);
        const data = rapidResponse.data;

        // Check karte hain ki array mein VPAs aaye hain ya nahi
        if (data && data.vpas && data.vpas.length > 0) {
            
            // Kisi bhi bank ki detail se asli naam nikal lo (Pehli entry best hai)
            const realName = data.vpas[0].name;

            console.log(`✅ Asli Naam Mil Gaya: ${realName}`);
            
            return res.json({ 
                success: true, 
                customer_name: realName, 
                vpa: upi_id 
            });

        } else {
            return res.json({ success: false, message: "Is number se koi UPI link nahi hai!" });
        }

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("❌ RapidAPI Error:", errorMsg);
        return res.json({ success: false, message: `API Error: Server down hai` });
    }
});

// ==========================================
// SERVER START
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 BlackPay Engine running on port ${PORT}`);
});
