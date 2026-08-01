require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// 1. MONGODB DATABASE CONNECTION
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Database Connected!'))
  .catch((err) => console.log('❌ Database Connection Error:', err));

const userSchema = new mongoose.Schema({
    mobile_number: { type: String, required: true },
    bound_accounts: [{
        wallet_type: String,
        upi_id: String,
        customer_name: String,
        is_verified: { type: Boolean, default: false }
    }]
});
const User = mongoose.model('User', userSchema);

// 2. UPI VERIFICATION API (Razorpay)
app.post('/api/verify-upi', async (req, res) => {
    const { upi_id, wallet_type, mobile_number } = req.body;

    if (!upi_id || !upi_id.includes('@')) {
        return res.status(400).json({ success: false, message: "Invalid UPI ID Format" });
    }

    try {
        console.log(`Verifying UPI: ${upi_id} for Wallet: ${wallet_type}`);

        const razorpayAuth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');

        const razorpayResponse = await axios.post(
            'https://api.razorpay.com/v1/payments/validate/vpa',
            { vpa: upi_id },
            { headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${razorpayAuth}` } }
        );

        if (razorpayResponse.data.success === true) {
            const customerName = razorpayResponse.data.customer_name;

            await User.findOneAndUpdate(
                { mobile_number: mobile_number }, 
                { $push: { bound_accounts: { wallet_type, upi_id, customer_name: customerName, is_verified: true } } },
                { new: true, upsert: true }
            );

            return res.status(200).json({ success: true, message: "UPI Verified Successfully!", customer_name: customerName });
        } else {
            return res.status(400).json({ success: false, message: "UPI ID invalid." });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: "Server Error during Verification." });
    }
});

// 3. SERVER START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 BlackPay Backend Server is running on port ${PORT}`);
});
