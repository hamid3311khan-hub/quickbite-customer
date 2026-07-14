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
    const count = await Product.countDocuments();
    if(count === 0){
      await Product.insertMany([
        { name: "Zinger Burger", price: 450, category: "Burgers", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", offer: "" },
        { name: "Chicken Pizza", price: 1200, category: "Pizza", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400", offer: "Buy 1 Get 1" }
      ]);
      console.log("Sample Products Added");
    }
  } catch(err){ console.log(err) }
};
seedProducts();

// API - PRODUCTS
app.get('/api/products', async (req, res) => { 
  const products = await Product.find();
  res.json(products);
});
app.post('/api/products', async (req, res) => { 
  const product = await Product.create(req.body);
  res.json(product);
});
app.put('/api/products/:id', async (req, res) => { 
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {new: true});
  res.json(product);
});
app.delete('/api/products/:id', async (req, res) => { 
  await Product.findByIdAndDelete(req.params.id);
  res.json({success: true});
});

// API - ORDERS
app.get('/api/orders', async (req, res) => { 
  const orders = await Order.find().sort({createdAt: -1});
  res.json(orders);
});
app.post('/api/orders', async (req, res) => { 
  const order = await Order.create(req.body);
  res.json(order);
});
app.put('/api/orders/:id', async (req, res) => { 
  const order = await Order.findByIdAndUpdate(req.params.id, {status: req.body.status}, {new: true});
  res.json(order);
});

// QR CODE WALA ROUTE
app.get('/api/qr/:amount', async (req, res) => {
  try {
    const amount = req.params.amount;
    const upiID = "tanbalkhi2014-3@okhdfcbank";
    const upiLink = `upi://pay?pa=${upiID}&pn=QuickBite&am=${amount}&cu=INR`;
    const qr = await QRCode.toDataURL(upiLink);
    res.json({ qr, upiID, amount });
  } catch (err) {
    res.status(500).json({error: err.message});
  }
}); 

// PAGES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'orders.html')));

// PORT BIND
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));

app.get('/myorder', (req, res) => res.sendFile(path.join(__dirname, 'public', 'myorder.html')));

// UPDATE ORDER STATUS
app.put('/api/orders/:id', async (req, res) => {
  const { status } = req.body;
  await db.collection('orders').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: status } }
  );
  res.json({ success: true });
});

// 1. DELETE ORDER
app.delete('/api/orders/:id', async (req, res) => {
  await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
});

// 2. TODAY'S SALES
app.get('/api/sales/today', async (req, res) => {
  const today = new Date();
  today.setHours(0,0,0,0);
  const orders = await db.collection('orders').find({ 
    createdAt: { $gte: today },
    status: "Delivered" 
  }).toArray();
  const total = orders.reduce((sum, o) => sum + o.total, 0);
  res.json({ total: total, count: orders.length });
});