require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const PDFDocument = require('pdfkit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: {origin: "*"} });
const PORT = process.env.PORT || 10000;

// MIDDLEWARE
app.use(cors({origin: "*"}));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));
app.use(express.static(path.join(__dirname, 'public')));

// DB CONNECT
mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err => { console.log('Mongo Error:', err); process.exit(1) });

// ===== MODELS =====
const MenuItem = mongoose.model('MenuItem', { 
    name: String, price: Number, category: String, desc: String, 
    image: String, veg: Boolean, inStock: {type:Boolean, default:true}, offer: Number,
    restaurantId: {type: String, default: 'default-shop'}
});
const Rider = mongoose.model('Rider', { name:String, fatherName:String, aadhar:String, pan:String, mobile:{type:String, unique:true}, aadharImg: String, panImg: String, photoImg: String, lat:Number, lng:Number, status:{type:String, default:"Pending"} });
const OrderSchema = new mongoose.Schema({ trackId: String, name:String, phone:String, address:String, items:[], total:Number, payment:String, status:{type:String, default:'Pending'}, riderLat:Number, riderLng:Number, pointsEarned:Number, coupon:String, discount:Number, shopLat: {type:Number, default: 25.5941}, shopLng: {type:Number, default: 85.1376}, custLat: Number, custLng: Number, riderId: String, restaurantId: {type: String, default: 'default-shop'} }, {timestamps: true});
const Order = mongoose.model('Order', OrderSchema);
const Coupon = mongoose.model('Coupon', {code:String, discount:Number, type:String});
const Restaurant = mongoose.model('Restaurant', {
    id: String, name: String, address: String, image: String, status: {type:String, default:"Active"}
});

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
    socket.on('riderLocation', async (data) => {
        await Rider.findOneAndUpdate({mobile: data.mobile}, {lat: data.lat, lng: data.lng, status: "Online"});
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

app.post('/api/menu', async (req,res)=>{
  try{
    const {name, price, desc, category, offer, image, restaurantId} = req.body;
    if(!image) return res.json({success:false, msg:"Image nahi mili"});
    const data = {name, price, desc, category, offer, image, restaurantId: restaurantId || 'default-shop', veg: req.body.veg === 'true', inStock: true};
    await new MenuItem(data).save();
    res.json({success:true});
  }catch(e){ res.json({success:false, msg:e.message}) }
});

app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });
app.put('/api/menu/:id/stock', async (req,res)=>{ const item = await MenuItem.findById(req.params.id); item.inStock =!item.inStock; await item.save(); res.json({success:true}); });
app.post('/api/orders', async (req,res)=>{ const trackId = 'QB' + Date.now(); const points = Math.floor(req.body.total / 10); await new Order({...req.body, trackId, pointsEarned: points}).save(); res.json({success:true, trackId}) });
app.get('/api/orders/track/:id', async (req,res)=>{ res.json(await Order.findOne({trackId:req.params.id})) });
app.get('/api/orders', async (req,res)=>{ res.json(await Order.find().sort({createdAt:-1})) });
app.get('/api/orders/history/:phone', async (req,res)=>{ res.json(await Order.find({phone:req.params.phone}).sort({createdAt:-1})) });
app.put('/api/orders/:id/status', async (req,res)=>{ const updated = await Order.findByIdAndUpdate(req.params.id, req.body, {new:true}); const waLink = `https://wa.me/91${updated.phone}?text=QuickBite Update%0AOrder: ${updated.trackId}%0AStatus: ${updated.status}`; res.json({success:true, customerWaLink: waLink}) });
app.delete('/api/orders/:id', async (req,res)=>{ await Order.findByIdAndDelete(req.params.id); res.json({success:true}) });
app.post('/api/order/delivered', async (req,res)=>{ try{ const order = await Order.findOne({trackId: req.body.orderId}); if(!order) return res.json({success:false, msg:"Order nahi mila"}); order.status = "Delivered"; await order.save(); res.json({success:true, msg:"Order Delivered ho gaya!"}); }catch(e){ res.json({success:false, msg:e.message}) } })

// RESTAURANTS API - MULTI RESTAURANT
app.get('/api/restaurants', async (req,res)=>{
    const shops = await Restaurant.find({status: "Active"});
    if(shops.length === 0){
        return res.json([
            {id: "moms-kitchen", name: "Moms Kitchen", address: "Chhapra, Bihar", image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=200&fit=crop"},
            {id: "pizza-hub", name: "Pizza Hub", address: "Patna, Bihar", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=200&fit=crop"}
        ]);
    }
    res.json(shops);
});

// RIDER + COUPON + STATS
app.post('/api/rider/register', async (req,res)=>{ res.json({success:false, msg: 'Rider photo abhi file se hi jayegi.'}); });
app.post('/api/rider/login', async (req,res)=>{ let rider = await Rider.findOne({mobile: req.body.mobile}); if(!rider) return res.json({success:false, msg:"Mobile register nahi hai"}); if(!['Approved','Online'].includes(rider.status)) return res.json({success:false, msg:"Approval pending hai"}); await Rider.findOneAndUpdate({mobile: req.body.mobile}, {status: "Online"}); res.json({success:true, rider}); });
app.get('/api/rider/orders/:mobile', async (req,res)=>{ const orders = await Order.find({riderId: req.params.mobile, status: {$ne: 'Delivered'}}).sort({createdAt:-1}); res.json(orders); })
app.get('/api/riders/approved', async (req,res)=> res.json(await Rider.find({status: {$in: ['Approved','Online']}})) );
app.put('/api/rider/:id/approve', async (req,res)=>{ await Rider.findByIdAndUpdate(req.params.id, {status: 'Approved'}); res.json({success: true}); })
app.delete('/api/riders/:id', async (req,res)=>{ await Rider.findByIdAndDelete(req.params.id); res.json({success:true}); })
app.get('/api/riders', async (req,res)=> res.json(await Rider.find()) );
app.put('/api/order/assign', async (req,res)=>{ const busyOrder = await Order.findOne({ riderId: req.body.riderId, status: {$ne: 'Delivered'} }); if(busyOrder){ return res.json({success:false, msg:"Ye rider abhi busy hai."}) } await Order.findByIdAndUpdate(req.body.orderId, { riderId: req.body.riderId, status: 'Out for Delivery' }); res.json({success:true}) });
app.get('/api/rider/check-busy/:mobile', async (req,res)=>{ const busy = await Order.findOne({riderId: req.params.mobile, status: {$ne: 'Delivered'}}); res.json({free:!busy}); })
app.post('/api/coupon', async (req,res)=>{ await new Coupon(req.body).save(); res.json({success:true}) });
app.post('/api/coupon/validate', async (req,res)=>{ const coupon = await Coupon.findOne({code:req.body.code}); if(coupon) { res.json({success:true,...coupon._doc}) } else { res.json({success:false}) } });
app.get('/api/stats', async (req,res)=>{ const orders = await Order.countDocuments(); const customers = await Order.distinct('phone').then(a=>a.length); res.json({orders, customers}) });
app.get('/api/report', async (req,res)=>{ const {start, end} = req.query; const endDate = new Date(end); endDate.setHours(23,59,59); const orders = await Order.find({createdAt: {$gte: new Date(start), $lte: endDate}}); const totalRevenue = orders.reduce((a,b)=>a+b.total,0); res.json({totalRevenue, totalOrders:orders.length, topItems:[]}) });
app.post('/api/broadcast', async (req,res)=>{ const {message, type, numbers} = req.body; let phones = []; if(type === 'all'){ phones = await Order.distinct('phone'); } else { phones = numbers.split(',').map(n=>n.trim()); } const links = phones.map(p => `https://wa.me/91${p}?text=${encodeURIComponent(message)}`); res.json({count: phones.length, links}); });

// ===== INVOICE PDF =====
app.get('/invoice', async (req,res)=>{
  const { id } = req.query;
  const order = await Order.findOne({trackId:id});
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

server.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));