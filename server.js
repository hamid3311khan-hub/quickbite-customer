const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode'); // QR ke liye

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// MONGODB CONNECT
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://username:password@cluster.mongodb.net/quickbite";
mongoose.connect(MONGO_URI).then(() => console.log("MongoDB Connected"));

// SCHEMA
const productSchema = new mongoose.Schema({
  name: String, price: Number, category: String, image: String, offer: String
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
  items: Array, total: Number, status: {type: String, default: "New"}, createdAt: {type: Date, default: Date.now}
});
const Order = mongoose.model('Order', orderSchema);

// AUTO SAMPLE DATA
const seedProducts = async () => {
  if(await Product.countDocuments() === 0){
    await Product.insertMany([
      { name: "Zinger Burger", price: 450, category: "Burgers", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", offer: "" },
      { name: "Chicken Pizza", price: 1200, category: "Pizza", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400", offer: "Buy 1 Get 1" }
    ]);
    console.log("Sample Products Added");
  }
};
seedProducts();

// API - PRODUCTS
app.get('/api/products', async (req, res) => res.json(await Product.find()));
app.post('/api/products', async (req, res) => res.json(await Product.create(req.body)));
app.put('/api/products/:id', async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, req.body, {new: true})));
app.delete('/api/products/:id', async (req, res) => res.json(await Product.findByIdAndDelete(req.params.id)));

// API - ORDERS - SIRF 1 BAAR
app.get('/api/orders', async (req, res) => res.json(await Order.find().sort({createdAt