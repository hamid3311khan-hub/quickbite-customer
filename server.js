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
.catch(err => {
    console.log('Mongo Error:', err);
    process.exit(1)
});

// Schema
const MenuItem = mongoose.model('MenuItem', {
    name: String, price: Number, category: String, desc: String, 
    img: String, veg: Boolean, inStock: {type:Boolean, default:true}, offer: Number
});

// FIX: Schema alag banaya taaki timestamps chale
const OrderSchema = new mongoose.Schema({
    trackId: String, name:String, phone:String, address:String, 
    items:[], total:Number, payment:String, status:{type:String, default:'Pending'},
    riderLat:Number, riderLng:Number, pointsEarned:Number, coupon:String, discount:Number
}, {timestamps: true});

const Order = mongoose.model('Order', OrderSchema);

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

app.put('/api/menu/:id/stock', async (req,res)=>{ 
    const item = await MenuItem.findById(req.params.id);
    item.inStock = !item.inStock;
    await item.save();
    res.json({success:true});
});

app.post('/api/orders', async (req,res)=>{ 
    const trackId = 'QB' + Date.now(); 
    const points = Math.floor(req.body.total / 10); // 10rs = 1 point
    await new Order({...req.body, trackId, pointsEarned: points}).save(); 
    res.json({success:true, trackId}) 
});

app.get('/api/orders/track/:id', async (req,res)=>{ res.json(await Order.findOne({trackId:req.params.id})) });

app.get('/api/orders', async (req,res)=>{ res.json(await Order.find().sort({createdAt:-1})) }); // createdAt se sort

app.get('/api/orders/history/:phone', async (req,res)=>{ res.json(await Order.find({phone:req.params.phone}).sort({createdAt:-1})) });

app.put('/api/orders/:id/status', async (req,res)=>{ 
    const updated = await Order.findByIdAndUpdate(req.params.id, req.body, {new:true}); 
    const waLink = `https://wa.me/91${updated.phone}?text=QuickBite Update%0AOrder: ${updated.trackId}%0AStatus: ${updated.status}`;
    res.json({success:true, customerWaLink: waLink}) 
});

app.delete('/api/orders/:id', async (req,res)=>{ 
    await Order.findByIdAndDelete(req.params.id); 
    res.json({success:true}) 
});

app.post('/api/coupon', async (req,res)=>{ 
    await new Coupon(req.body).save(); 
    res.json({success:true}) 
});

app.post('/api/coupon/validate', async (req,res)=>{ 
    const coupon = await Coupon.findOne({code:req.body.code}); 
    if(coupon) {
        res.json({success:true, ...coupon._doc})
    } else {
        res.json({success:false})
    }
});

app.get('/api/stats', async (req,res)=>{ 
    const orders = await Order.countDocuments(); 
    const customers = await Order.distinct('phone').then(a=>a.length); 
    res.json({orders, customers}) 
});

app.get('/api/report', async (req,res)=>{ 
    const {start, end} = req.query;
    const endDate = new Date(end);
    endDate.setHours(23,59,59);
    const orders = await Order.find({createdAt: {$gte: new Date(start), $lte: endDate}});
    const totalRevenue = orders.reduce((a,b)=>a+b.total,0);
    res.json({totalRevenue, totalOrders:orders.length, topItems:[]}) 
});

// Broadcast: All, New, Manual
app.post('/api/broadcast', async (req,res)=>{
    const {message, type, numbers} = req.body;
    let phones = [];
    if(type === 'all'){
        phones = await Order.distinct('phone');
    } else if(type === 'new'){
        phones = []; // New customer DB baad me banega
        return res.json({count: 0, links: [], msg: "New customer DB nahi hai abhi"})
    } else {
        phones = numbers.split(',').map(n=>n.trim());
    }
    const links = phones.map(p => `https://wa.me/91${p}?text=${encodeURIComponent(message)}`);
    res.json({count: phones.length, links});
});

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/order-details', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));

app.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));