require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const PDFDocument = require('pdfkit');
const multer = require('multer');
const upload = multer();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: {origin: "*"} });
const PORT = process.env.PORT || 10000;

app.use(cors({origin: "*"}));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err => { console.log('Mongo Error:', err); process.exit(1) });

// ===== MODELS =====
const MenuItem = mongoose.model('MenuItem', {
    name: String, price: Number, category: String, desc: String,
    image: String, veg: Boolean, inStock: {type:Boolean, default:true}, offer: Number,
    restaurantId: {type: String, default: 'default-shop'}
});

const RestaurantOwner = mongoose.model('RestaurantOwner', {
    restaurantId: {type: String, unique: true},
    restaurantName: String,
    ownerName: String,
    mobile: {type: String, unique: true},
    email: {type: String, unique: true},
    address: String,
    password: String,
    status: {type: String, default: "Pending"},
    paymentStatus: {type: String, default: "Paid"},
    lastPaymentDate: {type: Date, default: Date.now},
    nextDueDate: {type: Date},
    createdAt: {type: Date, default: Date.now}
});

const Rider = mongoose.model('Rider', {
    name:String, fatherName:String, aadhar:String, pan:String,
    mobile:{type:String, unique:true}, aadharImg: String, panImg: String, photoImg: String,
    lat:Number, lng:Number, lastUpdate:Date, status:{type:String, default:"Pending"}, // Pending, Approved, Online, Offline
    restaurantId: {type: String}
});

const OrderSchema = new mongoose.Schema({
    trackId: String, name:String, phone:String, address:String, items:[], total:Number, payment:String,
    status:{type:String, default:'Pending'}, riderLat:Number, riderLng:Number, pointsEarned:Number,
    coupon:String, discount:Number, shopLat: {type:Number, default: 25.5941}, shopLng: {type:Number, default: 85.1376},
    custLat: Number, custLng: Number, riderId: String,
    restaurantId: {type: String, default: 'default-shop'}
}, {timestamps: true});
const Order = mongoose.model('Order', OrderSchema);
const Coupon = mongoose.model('Coupon', {code:String, discount:Number, type:String});
const Offer = mongoose.model('Offer', {code:String, discount:Number, type:{type:String, default:"PERCENT"}, restaurantId:String, createdAt:{type:Date, default:Date.now}});
const Restaurant = mongoose.model('Restaurant', {id:String, name:String, address:String, image:String, status:{type:String, default:"Active"}});

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
    socket.on('riderLocation', async (data) => {
        await Rider.findOneAndUpdate({mobile: data.mobile}, {lat: data.lat, lng: data.lng});
        await Order.updateMany({riderId: data.mobile, status: "Out for Delivery"}, {riderLat: data.lat, riderLng: data.lng});
        io.emit('locationUpdate');
    });
});

// ===== API ROUTES =====
app.get('/api/menu', async (req,res)=> {
    const shopId = req.query.shop || 'default-shop';
    const items = await MenuItem.find({restaurantId: shopId});
    res.json(items);
});

app.get('/api/orders', async (req,res)=>{
    const shop = req.query.shop;
    if(shop) return res.json(await Order.find({restaurantId: shop}).sort({createdAt:-1}));
    res.json(await Order.find().sort({createdAt:-1}))
});

app.get('/api/restaurant/stats', async (req,res)=>{
    const shop = req.query.shop;
    const today = new Date(); today.setHours(0,0,0,0);
    const orders = await Order.find({ restaurantId: shop, createdAt: {$gte: today} });
    const revenue = orders.reduce((a,b)=>a+b.total, 0);
    res.json({ orders: orders.length, revenue });
})

app.post('/api/restaurant/offer', async (req,res)=>{
    await new Offer(req.body).save();
    res.json({success:true, msg: "Offer Created!"});
})

app.post('/api/menu', upload.none(), async (req,res)=>{
  try{
    const {name, price, desc, category, offer, image, restaurantId} = req.body;
    await new MenuItem({
        name, price, desc, category, offer,
        image: image || '',
        restaurantId: restaurantId || 'default-shop',
        veg: req.body.veg === 'true',
        inStock: true
    }).save();
    res.json({success:true});
  }catch(e){ res.json({success:false, msg:e.message}) }
});

app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });
app.put('/api/menu/:id/stock', async (req,res)=>{ const item = await MenuItem.findById(req.params.id); item.inStock =!item.inStock; await item.save(); res.json({success:true}); });

app.post('/api/orders', async (req,res)=>{
    const trackId = 'QB' + Date.now();
    const points = Math.floor(req.body.total / 10);
    const newOrder = await new Order({...req.body, trackId, pointsEarned: points}).save();
    const ownerData = await RestaurantOwner.findOne({restaurantId: newOrder.restaurantId});
    if(ownerData){ console.log(`Owner WA: https://wa.me/91${ownerData.mobile}?text=Naya Order: ${newOrder.trackId}`); }
    res.json({success:true, trackId})
});

app.get('/api/orders/track/:id', async (req,res)=>{ res.json(await Order.findOne({trackId:req.params.id})) });
app.get('/api/orders/history/:phone', async (req,res)=>{ res.json(await Order.find({phone:req.params.phone}).sort({createdAt:-1})) });
app.put('/api/orders/:id/status', async (req,res)=>{ const updated = await Order.findByIdAndUpdate(req.params.id, req.body, {new:true}); const waLink = `https://wa.me/91${updated.phone}?text=QuickBite Update%0AOrder: ${updated.trackId}%0AStatus: ${updated.status}`; res.json({success:true, customerWaLink: waLink}) });
app.delete('/api/orders/:id', async (req,res)=>{ await Order.findByIdAndDelete(req.params.id); res.json({success:true}) });

// ===== RESTAURANT OWNER APIs =====
app.post('/api/restaurant/register', async (req,res)=>{
    try{
        const {restaurantId, restaurantName, ownerName, mobile, email, address, password} = req.body;
        const exists = await RestaurantOwner.findOne({$or: [{mobile}, {email}, {restaurantId}]});
        if(exists) return res.json({success:false, msg: "Mobile/Email/ID pehle se hai"});

        let nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);

        await new RestaurantOwner({
            restaurantId, restaurantName, ownerName, mobile, email, address, password,
            paymentStatus: "Paid",
            lastPaymentDate: Date.now(),
            nextDueDate: nextYear
        }).save();
        res.json({success:true, msg: "Register ho gaya. Approval pending hai."})
    }catch(e){ res.json({success:false, msg:e.message}) }
});

app.post('/api/restaurant/login', async (req,res)=>{
    const {email, password} = req.body;
    const owner = await RestaurantOwner.findOne({email, password});
    if(!owner) return res.json({success:false, msg: "Galat email ya password"});
    if(owner.status!== "Approved") return res.json({success:false, msg: "Approval pending hai"});
    res.json({success:true, owner})
});

app.get('/api/restaurant/owners', async (req,res)=> res.json(await RestaurantOwner.find().sort({createdAt:-1})) );

app.put('/api/restaurant/owner/:id/approve', async (req,res)=>{
    const owner = await RestaurantOwner.findByIdAndUpdate(req.params.id, {status: "Approved"}, {new:true});
    const exists = await Restaurant.findOne({id: owner.restaurantId});
    if(!exists){
        await new Restaurant({id: owner.restaurantId, name: owner.restaurantName, address: owner.address, image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=200&fit=crop"}).save();
    }
    res.json({success:true});
});

app.delete('/api/restaurant/owner/:id', async (req,res)=>{ await RestaurantOwner.findByIdAndDelete(req.params.id); res.json({success:true}); });

app.get('/api/restaurants', async (req,res)=>{
    const shops = await Restaurant.find({status: "Active"});
    res.json(shops);
});

// ===== RIDER APIs with LOGIN-LOGOUT =====
app.post('/api/rider/register', upload.none(), async (req,res)=>{
    try{
        const {name, fatherName, aadhar, pan, mobile, restaurantId} = req.body;
        await new Rider({name, fatherName, aadhar, pan, mobile, restaurantId}).save();
        res.json({success:true, msg:"Rider Register ho gaya. Approval pending hai."});
    }catch(e){ res.json({success:false, msg:e.message}) }
});

// NEW: Rider Login
app.post('/api/rider/login', async (req,res)=>{
    let rider = await Rider.findOne({mobile: req.body.mobile});
    if(!rider) return res.json({success:false, msg:"Mobile register nahi hai"});
    if(rider.status === "Pending") return res.json({success:false, msg:"Approval pending hai"});
    rider = await Rider.findOneAndUpdate({mobile: req.body.mobile}, {status: "Online"}, {new:true});
    res.json({success:true, rider});
});

// NEW: Rider Status Update - Online/Offline
app.put('/api/rider/:id/status', async (req,res)=>{ 
    await Rider.findByIdAndUpdate(req.params.id, {status: req.body.status}); 
    res.json({success: true}); 
})

// NEW: Rider Location Update - Order me bhi update hoga
app.post('/api/riderLocation', async (req,res)=>{ 
    const {mobile, lat, lng} = req.body;
    await Rider.findOneAndUpdate({mobile}, {lat, lng, lastUpdate: new Date()}); 
    // Order me bhi location save karo taaki customer track kar sake
    await Order.updateMany({riderId: mobile, status: "Out for Delivery"}, {riderLat: lat, riderLng: lng});
    res.json({success: true}); 
})

app.get('/api/rider/orders/:mobile', async (req,res)=>{
    const orders = await Order.find({riderId: req.params.mobile, status: {$ne: 'Delivered'}}).sort({createdAt:-1});
    res.json(orders);
})

// Sirf usi restaurant ke approved/online rider
app.get('/api/riders/approved', async (req,res)=> {
    const shop = req.query.shop;
    res.json(await Rider.find({restaurantId: shop, status: {$in: ['Approved','Online']}}))
});

app.put('/api/rider/:id/approve', async (req,res)=>{ await Rider.findByIdAndUpdate(req.params.id, {status: 'Approved'}); res.json({success: true}); })
app.delete('/api/riders/:id', async (req,res)=>{ await Rider.findByIdAndDelete(req.params.id); res.json({success:true}); })
app.get('/api/riders', async (req,res)=> res.json(await Rider.find()) );

app.put('/api/order/assign', async (req,res)=>{
    const busyOrder = await Order.findOne({ riderId: req.body.riderId, status: {$ne: 'Delivered'} });
    if(busyOrder){ return res.json({success:false, msg:"Ye rider abhi busy hai."}) }
    await Order.findByIdAndUpdate(req.body.orderId, { riderId: req.body.riderId, status: 'Out for Delivery' });
    res.json({success:true})
});
app.post('/api/order/delivered', async (req,res)=>{ await Order.findByIdAndUpdate(req.body.orderId, {status: 'Delivered'}); res.json({success:true, msg:"Order Delivered Marked"}); });
app.get('/api/rider/check-busy/:mobile', async (req,res)=>{ const busy = await Order.findOne({riderId: req.params.mobile, status: {$ne: 'Delivered'}}); res.json({free:!busy}); })
app.post('/api/coupon', async (req,res)=>{ await new Coupon(req.body).save(); res.json({success:true}) });
app.post('/api/coupon/validate', async (req,res)=>{ const coupon = await Coupon.findOne({code:req.body.code}); if(coupon) { res.json({success:true,...coupon._doc}) } else { res.json({success:false}) } });
app.get('/api/stats', async (req,res)=>{ const orders = await Order.countDocuments(); const customers = await Order.distinct('phone').then(a=>a.length); res.json({orders, customers}) });
app.get('/api/report', async (req,res)=>{ const {start, end} = req.query; const endDate = new Date(end); endDate.setHours(23,59,59); const orders = await Order.find({createdAt: {$gte: new Date(start), $lte: endDate}}); const totalRevenue = orders.reduce((a,b)=>a+b.total,0); res.json({totalRevenue, totalOrders:orders.length, topItems:[]}) });
app.post('/api/broadcast', async (req,res)=>{ const {message, type, numbers} = req.body; let phones = []; if(type === 'all'){ phones = await Order.distinct('phone'); } else { phones = numbers.split(',').map(n=>n.trim()); } const links = phones.map(p => `https://wa.me/91${p}?text=${encodeURIComponent(message)}`); res.json({count: phones.length, links}); });

app.get('/invoice', async (req,res)=>{
  const { id } = req.query;
  const order = await Order.findOne({trackId:id});
  if(!order) return res.status(404).send("Order not found");
  const doc = new PDFDocument({margin: 40});
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=QuickBite-${id}.pdf`);
  doc.pipe(res);
  doc.fontSize(22).text('QuickBite', {align: 'center'});
  doc.moveDown();
  doc.fontSize(11).text(`Order ID: ${order.trackId}`);
  doc.text(`Customer: ${order.name}`);
  doc.moveDown();
  order.items.forEach(i=>{ doc.text(`${i.name} x ${i.qty} = ₹${i.price*i.qty}`); });
  doc.moveDown().fontSize(14).text(`Grand Total: ₹${order.total}`);
  doc.end();
})

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));
app.get('/rider-register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider-register.html')));
app.get('/restaurants', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurants.html')));
app.get('/restaurant-register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant-register.html')));
app.get('/restaurant-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant-login.html')));
app.get('/restaurant-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant-dashboard.html')));
app.get('/restaurant-profile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant-profile.html')));
app.get('/admin-owners', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-owners.html')));

server.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));