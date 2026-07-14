const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

// MONGODB CONNECT
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://username:password@cluster.mongodb.net/quickbite";
mongoose.connect(MONGO_URI).then(() => console.log("MongoDB Connected")).catch(err => console.log(err));

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
  try {
    if(await Product.countDocuments() === 0){
      await Product.insertMany([
        { name: "Zinger Burger", price: 450, category: