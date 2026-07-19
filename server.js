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
app.get('/track', (req,res)=> res.sendFile(path.join(__dirname, 'public/track.html'))); // <-- YE CHANGE KIYA
app.get('/order-details', (req,res)=> res.sendFile(path.join(__dirname, 'public/order-details.html')));

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({storage});

mongoose.connect(process.env.MONGO_URL).then(()=>console.log('✅ MongoDB Connected')).catch(e=>console.log(e));

// SCHEMAS
const MenuItem = mongoose.model('MenuItem', new mongoose.Schema({
    name:String, price:Number, desc:String, img:String, 
    offer:{type:Number, default:0}, 
    category:{type:String, default:'Other'},
    inStock:{type:Boolean, default:true}
}, {timestamps:true}));

// 2.TRACKING + 5.LOYALTY KE LIYE 2 FIELD ADD KIYE
const Order = mongoose.model('Order', new mongoose.Schema({
    name:String, phone:String, address:String, items:Array, total:Number, 
    payment:{type:String, default:'COD'}, status:{type:String, default:'Pending'}, 
    trackId:String, coupon:{type:String, default:''}, discount:{type:Number, default:0},
    pointsEarned: {type:Number, default:0}, // 5. LOYALTY
    riderLat: {type:Number, default: 23.6102}, // 2. TRACKING - Ramna, Jharkhand
    riderLng: {type:Number, default: 85.2799}  // 2. TRACKING
}, {timestamps:true}));

const Coupon = mongoose.model('Coupon', new mongoose.Schema({
    code:String, discount:Number, type:{type:String, default:'FLAT'}
}, {timestamps:true}));

// MENU API
app.get('/api/menu', async (req,res)=> res.json(await MenuItem.find().sort({createdAt:-1})));
app.put('/api/menu/:id/stock', async (req,res)=>{ 
    const item = await MenuItem.findById(req.params.id);
    item.inStock = !item.inStock;
    await item.save();
    res.json({success:true, inStock: item.inStock}); 
});
app.post('/api/menu', upload.single('img'), async (req,res)=>{
    const data = {...req.body, img: req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/400'};
    await new MenuItem(data).save();
    res.json({success:true});
});
app.put('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndUpdate(req.params.id, req.body); res.json({success:true}); });
app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });

// COUPON API
app.post('/api/coupon/validate', async (req,res)=>{
    const coupon = await Coupon.findOne({code:req.body.code.toUpperCase()});
    if(!coupon) return res.json({success:false, msg:"Invalid Coupon"});
    res.json({success:true, discount:coupon.discount, type:coupon.type});
});
app.post('/api/coupon', async (req,res)=>{ await new Coupon(req.body).save(); res.json({success:true}); });

// 3. STATS + REPORT API
app.get('/api/stats', async (req,res)=>{
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await Order.distinct("phone");
    res.json({orders: totalOrders, customers: totalCustomers.length});
});

// 3. SALES REPORT API - Date filter ke sath
app.get('/api/report', async (req,res)=>{
    const {start, end} = req.query;
    const filter = {};
    if(start && end) filter.createdAt = {$gte: new Date(start), $lte: new Date(end)};
    
    const orders = await Order.find(filter);
    const deliveredOrders = orders.filter(o => o.status === 'Delivered');
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;

    let itemCount = {};
    deliveredOrders.forEach(o => o.items.forEach(i => {
        itemCount[i.name] = (itemCount[i.name] || 0) + i.qty
    }));
    const topItems = Object.entries(itemCount).sort((a,b)=>b[1]-a[1]).slice(0,5);

    res.json({totalRevenue, totalOrders, topItems, orders});
});

// 3. CSV DOWNLOAD
app.get('/api/report/download', async (req,res)=>{
    const {start, end} = req.query;
    const filter = {};
    if(start && end) filter.createdAt = {$gte: new Date(start), $lte: new Date(end)};
    const orders = await Order.find(filter);

    let csv = 'Date,TrackID,Name,Phone,Total,Status,Payment,Points\n';
    orders.forEach(o=>{
        csv += `${o.createdAt.toLocaleDateString()},${o.trackId},${o.name},${o.phone},${o.total},${o.status},${o.payment},${o.pointsEarned}\n`
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('sales_report.csv');
    res.send(csv);
});

// ORDER API
app.post('/api/orders', async (req,res)=>{ 
    const trackId = 'QB' + Date.now(); 
    // 5. LOYALTY: ₹100 = 5 Points
    const points = Math.floor(req.body.total / 100) * 5;
    await new Order({...req.body, trackId, pointsEarned: points}).save(); 
    
    const adminNumber = "918207836370"; // TERA NUMBER
    const items = req.body.items.map(i=>`${i.name} x${i.qty}`).join(', ');
    const msg = `New Order: ${trackId}%0AName: ${req.body.name}%0APhone: ${req.body.phone}%0AAddress: ${req.body.address}%0ATotal: ₹${req.body.total}%0APayment: ${req.body.payment}%0APoints Earned: ${points}%0AItems: ${items}`;
    const waLink = `https://wa.me/${adminNumber}?text=${msg}`;
    
    res.json({success:true, trackId, waLink}); 
});

app.get('/api/orders', async (req,res)=> res.json(await Order.find().sort({createdAt:-1})));
app.get('/api/orders/history/:phone', async (req,res)=> res.json(await Order.find({phone:req.params.phone}).sort({createdAt:-1})));
app.get('/api/orders/track/:id', async (req,res)=> { const order = await Order.findOne({trackId:req.params.id}); res.json(order); });

// 2. STATUS UPDATE + 4. NOTIFICATION UPDATE
app.put('/api/orders/:id/status', async (req,res)=>{ 
    const order = await Order.findById(req.params.id);
    order.status = req.body.status;
    // Rider location update
    if(req.body.riderLat) { order.riderLat = req.body.riderLat; order.riderLng = req.body.riderLng; }
    await order.save(); 
    
    const trackLink = `https://quickbite-ymqk.onrender.com/track?id=${order.trackId}`; // <-- YE LINK AB TRACK PE JAYEGA
    const customerMsg = `QuickBite Update 🛵%0AOrder: ${order.trackId}%0AStatus: ${order.status}%0APayment: ${order.payment}%0A%0ALive Track: ${trackLink}`;
    const customerWaLink = `https://wa.me/91${order.phone}?text=${customerMsg}`;
    res.json({success:true, customerWaLink, trackLink}); 
});

// 4. BROADCAST - TEMPLATE BETTER KIYA
app.post('/api/broadcast', async (req,res)=>{
    const {message, type, numbers} = req.body;
    let users = [];
    if(type == 'all'){
        users = await Order.distinct("phone"); 
    } else {
        users = numbers.split(',').map(n => n.trim());
    }
    const links = users.map(phone => `https://wa.me/91${phone}?text=${encodeURIComponent("🍔 QuickBite Offer 🍔\n\n" + message)}`);
    res.json({success:true, links, count: users.length});
});

app.delete('/api/orders/:id', async (req,res)=>{ await Order.findByIdAndDelete(req.params.id); res.json({success:true}); });

// ADMIN LOGIN
app.post('/api/admin/login', (req,res)=>{ res.json({success: req.body.password === 'admin123'}); });

// AUTO PING
setInterval(() => {
    fetch(`https://quickbite-ymqk.onrender.com/api/menu`).catch(()=>{});
}, 600000); 

app.listen(PORT, ()=>console.log(`🚀 Server on ${PORT}`));