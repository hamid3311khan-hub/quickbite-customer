const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

const MONGO_URL = process.env.MONGO_URL;
let db; // GLOBAL

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 1. MONGODB CONNECT
async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    db = client.db('quickbite');
    console.log("MongoDB Connected");
  } catch (e) {
    console.error("DB Connection Failed", e);
  }
}
connectDB();

// 2. CREATE ORDER
app.post('/api/orders', async (req, res) => {
  try {
    const order = { ...req.body, status: 'Paid', createdAt: new Date() };
    const result = await db.collection('orders').insertOne(order);
    res.json({ success: true, orderId: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. GET ALL ORDERS
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. UPDATE ORDER STATUS - YAHI LINE FIX KI
app.put('/api/orders/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await db.collection('orders').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: status } // <- yaha } band kiya
    );
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. DELETE ORDER
app.delete('/api/orders/:id', async (req, res) => {
  try {
    await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 6. TODAY'S SALES
app.get('/api/sales/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const orders = await db.collection('orders').find({ 
      createdAt: { $gte: today },
      status: "Delivered" 
    }).toArray();
    const total = orders.reduce((sum, o) => sum + o.total, 0);
    res.json({ total: total, count: orders.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 7. SERVER START
app.listen(PORT, () => console.log(`Server running on ${PORT}`));