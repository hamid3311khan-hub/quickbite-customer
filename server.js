require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const PDFDocument = require('pdfkit');
const multer = require('multer');
const cron = require('node-cron');
const upload = multer();
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: {origin: "*"} });
const PORT = process.env.PORT || 10000;

app.use(cors({origin: "*"}));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

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
    restaurantId: {type: String, unique: true}, restaurantName: String, ownerName: String,
    mobile: {type: String, unique: true}, email: {type: String, unique: true}, address: String,
    password: String, status: {type: String, default: "Pending"}, plan_status: {type: String, default: "Trial"},
    registration_fee_paid: {type: Number, default: 200}, payment_proof: {type: String, default: null},
    trial_end_date: {type: Date}, payout_due: {type: Number, default: 0},
    paymentStatus: {type: String, default: "Paid"}, lastPaymentDate: {type: Date, default: Date.now},
    nextDueDate: {type: Date}, createdAt: {type: Date, default: Date.now}
});

const Rider = mongoose.model('Rider', {
    name:String, fatherName:String, aadhar:String, pan:String,
    mobile:{type:String, unique:true}, aadharImg: String, panImg: String, photoImg: String,
    lat:Number, lng:Number, lastUpdate:Date, status:{type:String, default:"Pending"},
    restaurantId: {type: String}, cash_balance: {type: Number, default: 0},
    weekly_orders: {type: Number, default: 0}, weekly_bonus: {type: Number, default: 0}
});

const OrderSchema = new mongoose.Schema({
    trackId: String, name:String, phone:String, address:String, items:[],
    item_total: {type: Number, default: 0}, commission_5: {type: Number, default: 0},
    platform_fee: {type: Number, default: 10}, delivery_fee: {type: Number, default: 30},
    total:Number, cash_to_restaurant: {type: Number, default: 0},
    payment:String, status:{type:String, default:'Pending'},
    riderLat:Number, riderLng:Number, pointsEarned:Number,
    coupon:String, discount:Number, shopLat: {type:Number, default: 25.5941}, shopLng: {type:Number, default: 85.1376},
    custLat: Number, custLng: Number, riderId: String, restaurantId: {type: String, default: 'default-shop'},
    cash_deposited: {type: Boolean, default: false}, cash_deposit_proof: {type: String, default: null},
    is_peak: {type: Boolean, default: false}
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

// ===== HELPER =====
function calculateBill(item_total) {
    const commission_5 = Math.round(item_total * 0.05);
    const platform_fee = 10; const delivery_fee = 30;
    const grand_total = item_total + commission_5 + platform_fee + delivery_fee;
    const hour = new Date().getHours();
    const is_peak = (hour >= 12 && hour <= 15) || (hour >= 19 && hour <= 22);
    return {item_total, commission_5, platform_fee, delivery_fee, grand_total, cash_to_restaurant: item_total, is_peak};
}

// ===== API ROUTES =====
app.get('/api/menu', async (req,res)=> {
    const shopId = req.query.shop || 'default-shop';
    res.json(await MenuItem.find({restaurantId: shopId}));
});

app.post('/api/orders', async (req,res)=>{
    const trackId = 'QB' + Date.now();
    const item_total = req.body.items.reduce((a,b)=>a+(b.price*b.qty), 0);
    const bill = calculateBill(item_total);
    const newOrder = await new Order({...req.body, trackId,...bill, total: bill.grand_total}).save();
    res.json({success:true, trackId, bill})
});

app.get('/api/orders', async (req,res)=>{
    const shop = req.query.shop;
    if(shop) return res.json(await Order.find({restaurantId: shop}).sort({createdAt:-1}));
    res.json(await Order.find().sort({createdAt:-1}))
});

app.put('/api/order/assign', async (req,res)=>{
    const rider = await Rider.findOne({mobile: req.body.riderId});
    if(rider.cash_balance >= 500){ return res.json({success:false, msg:"⚠️ ₹500 cash pending. Pehle jama karein."}) }
    const busyOrder = await Order.findOne({ riderId: req.body.riderId, status: {$ne: 'Delivered'} });
    if(busyOrder){ return res.json({success:false, msg:"Ye rider abhi busy hai."}) }
    await Order.findByIdAndUpdate(req.body.orderId, { riderId: req.body.riderId, status: 'Out for Delivery' });
    res.json({success:true})
});

app.post('/api/order/delivered', async (req,res)=>{
    const order = await Order.findById(req.body.orderId);
    await Order.findByIdAndUpdate(req.body.orderId, {status: 'Delivered'});
    await Rider.findOneAndUpdate({mobile: order.riderId}, {$inc: {cash_balance: order.delivery_fee, weekly_orders: 1}});
    res.json({success:true, msg:"Order Delivered Marked"});
});

const storage = multer.diskStorage({ destination: './uploads/', filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }});
const uploadFile = multer({ storage: storage });

app.post('/api/rider/cash-deposit', uploadFile.single('proof'), async (req,res)=>{
    const {riderId, amount} = req.body;
    await Order.updateMany({riderId, cash_deposited: false}, {cash_deposited: true, cash_deposit_proof: req.file.filename});
    await Rider.findOneAndUpdate({mobile: riderId}, {$set: {cash_balance: 0}});
    res.json({success:true, msg:`₹${amount} jama ho gaya. Restaurant confirm karega.`})
})

app.post('/api/restaurant/cash-confirm', async (req,res)=>{
    const {riderId} = req.body;
    const orders = await Order.find({riderId, cash_deposited: true});
    let total_cash = orders.reduce((a,b)=>a+b.cash_to_restaurant, 0);
    await RestaurantOwner.findOneAndUpdate({restaurantId: orders[0].restaurantId}, {$inc: {payout_due: total_cash}});
    res.json({success:true, msg:`₹${total_cash} confirm ho gaya`})
})

app.post('/api/restaurant/payout', async (req,res)=>{
    await RestaurantOwner.findOneAndUpdate({restaurantId: req.body.restaurantId}, {$set: {payout_due: 0}});
    res.json({success:true, msg:"Payout ho gaya"})
})

app.get('/api/restaurant/stats', async (req,res)=>{
    const shop = req.query.shop;
    const today = new Date(); today.setHours(0,0,0,0);
    const orders = await Order.find({ restaurantId: shop, createdAt: {$gte: today} });
    const revenue = orders.reduce((a,b)=>a+b.item_total, 0);
    const payout = await RestaurantOwner.findOne({restaurantId: shop});
    res.json({ orders: orders.length, revenue, payout_due: payout.payout_due || 0 })
})

app.post('/api/restaurant/register', uploadFile.single('payment_proof'), async (req,res)=>{
    try{
        const {restaurantId, restaurantName, ownerName, mobile, email, address, password} = req.body;
        const exists = await RestaurantOwner.findOne({$or: [{mobile}, {email}, {restaurantId}]});
        if(exists) return res.json({success:false, msg: "Mobile/Email/ID pehle se hai"});
        const hashedPassword = await bcrypt.hash(password, 10);
        let trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate() + 30);
        await new RestaurantOwner({...req.body, password: hashedPassword, payment_proof: req.file.filename, trial_end_date: trialEnd}).save();
        res.json({success:true, msg: "Register ho gaya. Approval pending hai."})
    }catch(e){ res.json({success:false, msg:e.message}) }
});

app.post('/api/restaurant/login', async (req,res)=>{
    const {email, password} = req.body;
    const owner = await RestaurantOwner.findOne({email});
    if(!owner) return res.json({success:false, msg: "Galat email ya password"});
    const isMatch = await bcrypt.compare(password, owner.password);
    if(!isMatch) return res.json({success:false, msg: "Galat email ya password"});
    if(owner.status!== "Approved") return res.json({success:false, msg: "Approval pending hai"});
    res.json({success:true, owner})
});

app.get('/api/rider/orders/:mobile', async (req,res)=>{
    res.json(await Order.find({riderId: req.params.mobile, status: {$ne: 'Delivered'}}).sort({createdAt:-1}));
})
app.post('/api/rider/login', async (req,res)=>{
    let rider = await Rider.findOne({mobile: req.body.mobile});
    if(!rider) return res.json({success:false, msg:"Mobile register nahi hai"});
    if(rider.status === "Pending") return res.json({success:false, msg:"Approval pending hai"});
    rider = await Rider.findOneAndUpdate({mobile: req.body.mobile}, {status: "Online"}, {new:true});
    res.json({success:true, rider});
});
app.post('/api/riderLocation', async (req,res)=>{
    const {mobile, lat, lng} = req.body;
    await Rider.findOneAndUpdate({mobile}, {lat, lng, lastUpdate: new Date()});
    res.json({success: true});
})
app.put('/api/rider/:id/status', async (req,res)=>{ await Rider.findByIdAndUpdate(req.params.id, {status: req.body.status}); res.json({success: true}); })

app.post('/api/menu', upload.none(), async (req,res)=>{
  await new MenuItem({...req.body, image: req.body.image || '', restaurantId: req.body.restaurantId || 'default-shop', veg: req.body.veg === 'true'}).save();
  res.json({success:true});
app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });
app.put('/api/menu/:id/stock', async (req,res)=>{ const item = await MenuItem.findById(req.params.id); item.inStock =!item.inStock; await item.save(); res.json({success:true}); });
app.get('/api/orders/track/:id', async (req,res)=>{ res.json(await Order.findOne({trackId:req.params.id})) });
app.put('/api/orders/:id/status', async (req,res)=>{ await Order.findByIdAndUpdate(req.params.id, req.body); res.json({success:true}) });
app.post('/api/restaurant/offer', async (req,res)=>{ await new Offer(req.body).save(); res.json({success:true, msg: "Offer Created!"}); })

// ===== CRON =====
cron.schedule('0 0 *', async () => {
    const owners = await RestaurantOwner.find({status: "Approved"});
    for(let owner of owners){
        const today_orders = await Order.find({restaurantId: owner.restaurantId, createdAt: {$gte: new Date(new Date().setHours(0,0,0,0))}});
        let cut = today_orders.reduce((a,b)=>a+b.commission_5+b.platform_fee, 0);
        await RestaurantOwner.findByIdAndUpdate(owner._id, {$inc: {payout_due: -cut}});
    }
});

// ===== BILL PDF =====
app.get('/invoice', async (req,res)=>{
  const { id } = req.query; const order = await Order.findOne({trackId:id});
  const doc = new PDFDocument({margin: 40}); res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=QuickBite-${id}.pdf`); doc.pipe(res);
  doc.fontSize(22).text('QUICKBITE', {align: 'center'});
  doc.fontSize(10).text(`Order ID: ${order.trackId} | Date: ${new Date(order.createdAt).toLocaleDateString()}`, {align: 'center'}); doc.moveDown();
  doc.text('-------------------------------------------');
  order.items.forEach(i=>{ doc.text(`${i.name} x ${i.qty} ₹${i.price*i.qty}`); });
  doc.text('-------------------------------------------');
  doc.text(`Sub Total: ₹${order.item_total}`);
  doc.text(`GST 5%: ₹${order.commission_5}`);
  doc.text(`Delivery Fee: ₹${order.delivery_fee}`);
  doc.text(`Platform Fee: ₹${order.platform_fee}`);
  doc.text('-------------------------------------------');
  doc.fontSize(14).text(`Grand Total: ₹${order.total}`); doc.end();
})

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));
app.get('/restaurant-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant-dashboard.html')));
app.get('/bill-template.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bill-template.html')));
app.get('/restaurant-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant-login.html')));
app.get('/rider-register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider-register.html')));

server.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));