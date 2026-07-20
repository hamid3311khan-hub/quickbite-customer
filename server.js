require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// uploads folder
const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({origin: "*"}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// MongoDB
mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err => console.log('Mongo Error:', err));

// Schema
const MenuItem = mongoose.model('MenuItem', {
    name: String, price: Number, category: String, desc: String, 
    img: String, veg: Boolean, inStock: {type:Boolean, default:true}, offer: Number
});

const Order = mongoose.model('Order', {
    trackId: String, name:String, phone:String, address:String, 
    items:[], total:Number, payment:String, status:{type:String, default:'Pending'},
    riderLat:Number, riderLng:Number, pointsEarned:Number, coupon:String, discount:Number
});

const Coupon = mongoose.model('Coupon', {code:String, discount:Number, type:String});

// Multer
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({storage});

// ===== API ROUTES =====
app.get('/api/menu', async (req,res)=> { const items = await MenuItem.find(); res.json(items); });
app.post('/api/menu', upload.single('img'), async (req,res)=>{ 
    const data = {...req.body, img: req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/400', veg: req.body.veg === 'true'};
    await new MenuItem(data).save(); res.json({success:true}); 
});
app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });

app.post('/api/orders', async (req,res)=>{ const trackId = 'QB' + Date.now(); await new Order({...req.body, trackId}).save(); res.json({success:true, trackId}) });
app.get('/api/orders/track/:id', async (req,res)=>{ res.json(await Order.findOne({trackId:req.params.id})) });
app.get('/api/orders', async (req,res)=>{ res.json(await Order.find().sort({_id:-1})) });
app.get('/api/orders/history/:phone', async (req,res)=>{ res.json(await Order.find({phone:req.params.phone}).sort({_id:-1})) });
app.put('/api/orders/:id/status', async (req,res)=>{ await Order.findByIdAndUpdate(req.params.id, req.body); res.json({success:true}) });

app.post('/api/coupon/validate', async (req,res)=>{ const coupon = await Coupon.findOne({code:req.body.code}); if(coupon) res.json({success:true, ...coupon._doc}) else res.json({success:false}) });
app.get('/api/stats', async (req,res)=>{ const orders = await Order.countDocuments(); const customers = await Order.distinct('phone').then(a=>a.length); res.json({orders, customers}) });

// ===== PAGE ROUTES - public folder se =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));

app.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));