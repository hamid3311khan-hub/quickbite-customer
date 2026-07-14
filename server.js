const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const MONGO_URL = process.env.MONGO_URL;

// DB Connect
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URL);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('DB Connection Failed', err);
    }
};
connectDB();

// Order Schema
const orderSchema = new mongoose.Schema({
    name: String, phone: String, address: String,
    items: Array, total: Number, status: { type: String, default: 'Pending' }
}, { timestamps: true });
const Order = mongoose.model('Order', orderSchema);

// Routes
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = new Order(req.body);
        await newOrder.save();
        res.status(201).json({ message: 'Order Placed' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

app.get('/api/orders', async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
});

app.put('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status });
    res.json({ message: 'Status Updated' });
});

app.delete('/api/orders/:id', async (req, res) => {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order Deleted' });
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') res.json({ success: true });
    else res.status(401).json({ success: false });
});

// Home Route
app.get('/', (req, res) => {
    res.send('QuickBite API is Running ✅ <br> Go to /orders.html for admin panel');
});

// SIRF 1 BAAR LISTEN
app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});