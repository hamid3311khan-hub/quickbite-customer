const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

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

// API - ORDERS
app.get('/api/orders', async (req, res) => res.json(await Order.find().sort({createdAt: -1})));
app.post('/api/orders', async (req, res) => res.json(await Order.create(req.body)));
app.put('/api/orders/:id', async (req, res) => res.json(await Order.findByIdAndUpdate(req.params.id, {status: req.body.status})));

// PAGES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
// Sab orders nikalne ka API
app.get('/api/orders', async (req, res) => {
  try {
    const [orders] = await db.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(orders);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});
const Razorpay = require('razorpay');
const rzp = new Razorpay({ key_id: 'rzp_test_XXX', key_secret: 'XXX' });

app.post('/api/create-order', async (req, res)=>{
  const order = await rzp.orders.create({amount: req.body.amount, currency: "INR"});
  res.json(order);
});