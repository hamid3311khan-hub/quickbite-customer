require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const MONGO_URL = process.env.MONGO_URL;

app.use(cors());
app.use(express.json());

// public folder se saari files serve hongi
app.use(express.static(path.join(__dirname, 'public')));

// DB Connect
mongoose.connect(MONGO_URL)
.then(() => console.log('✅ MongoDB Connected'))
.catch((err) => console.error('❌ DB Connection Failed', err));

// Order Schema
const orderSchema = new mongoose.Schema({
    name: String, 
    phone: String, 
    address: String,
    items: Array, 
    total: Number, 
    status: { type: String, default: 'Pending' }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// API Routes
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(201).json({ message: 'Order Placed Successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    try {
        await Order.findByIdAndUpdate(req.params.id, { status: req.body.status });
        res.json({ message: 'Status Updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

app.delete('/api/orders/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ message: 'Order Deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on ${PORT}`);
});