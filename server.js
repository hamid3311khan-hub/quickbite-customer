require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });

app.use(cors({origin: "*"}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// PAGES ROUTES
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public/index1.html')));
app.get('/admin', (req,res)=> res.sendFile(path.join(__dirname, 'public/admin.html')));
app.get('/index', (req,res)=> res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/cart', (req,res)=> res.sendFile(path.join(__dirname, 'public/cart.html')));
app.get('/track', (req,res)=> res.sendFile(path.join(__dirname, 'public/myorder.html')));
app.get('/payment', (req,res)=> res.sendFile(path.join(__dirname, 'public/payment.html')));

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({storage});

mongoose.connect(process.env.MONGO_URL).then(()=>console.log('✅ MongoDB Connected')).catch(e=>console.log(e));

const MenuItem = mongoose.model('MenuItem', new mongoose.Schema({
    name:String, price:Number, desc:String, img:String, offer:{type:Number, default:0}, category:{type:String, default:'Other'}
}, {timestamps:true}));

const Order = mongoose.model('Order', new mongoose.Schema({
    name:String, phone:String, address:String, items:Array, total:Number, 
    payment:{type:String, default:'COD'}, status:{type:String, default:'Pending'}, trackId:String
}, {timestamps:true}));

// MENU API
app.get('/api/menu', async (req,res)=> res.json(await MenuItem.find().sort({createdAt:-1})));

app.post('/api/menu', upload.single('img'), async (req,res)=>{
    const data = {...req.body, img: req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/400'};
    await new MenuItem(data).save();
    res.json({success:true});
});

app.put('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndUpdate(req.params.id, req.body); res.json({success:true}); });
app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });

// ORDER API + WHATSAPP
app.post('/api/orders', async (req,res)=>{ 
    const trackId = 'QB' + Date.now(); 
    await new Order({...req.body, trackId}).save(); 
    
    // WHATSAPP LINK - APNA NUMBER YAHAN DAAL
    const adminNumber = "919876543210"; // <-- YE APNA NUMBER DAAL DE 91 ke sath
    const items = req.body.items.map(i=>`${i.name} x${i.qty}`).join(', ');
    const msg = `New Order: ${trackId}%0AName: ${req.body.name}%0APhone: ${req.body.phone}%0AAddress: ${req.body.address}%0ATotal: ₹${req.body.total}%0AItems: ${items}`;
    const waLink = `https://wa.me/${adminNumber}?text=${msg}`;
    
    res.json({success:true, trackId, waLink}); 
});

app.get('/api/orders', async (req,res)=> res.json(await Order.find().sort({createdAt:-1})));
app.get('/api/orders/history/:phone', async (req,res)=> res.json(await Order.find({phone:req.params.phone}).sort({createdAt:-1})));
app.get('/api/orders/track/:id', async (req,res)=> { const order = await Order.findOne({trackId:req.params.id}); res.json(order); });

// STATUS UPDATE + CUSTOMER KO NOTIFY - NAYA CODE
app.put('/api/orders/:id/status', async (req,res)=>{ 
    const order = await Order.findById(req.params.id);
    order.status = req.body.status;
    await order.save(); 

    // CUSTOMER KO WHATSAPP LINK
    const customerMsg = `QuickBite Update 🛵%0AOrder: ${order.trackId}%0AStatus: ${order.status}%0A%0ATrack: https://quickbite-ymqk.onrender.com/track`;
    const customerWaLink = `https://wa.me/91${order.phone}?text=${customerMsg}`;
    
    console.log("Send to Customer:", customerWaLink); 
    
    res.json({success:true, customerWaLink}); 
});

app.delete('/api/orders/:id', async (req,res)=>{ await Order.findByIdAndDelete(req.params.id); res.json({success:true}); });

// ADMIN LOGIN
app.post('/api/admin/login', (req,res)=>{ res.json({success: req.body.password === 'admin123'}); });

// AUTO PING - RENDER SLEEP NA HO
setInterval(() => {
    fetch(`https://quickbite-ymqk.onrender.com/api/menu`).catch(()=>{});
}, 600000); // 10 min me 1 baar

app.listen(PORT, ()=>console.log(`🚀 Server on ${PORT}`));

app.get('/order-details', (req,res)=> res.sendFile(path.join(__dirname, 'public/order-details.html')));