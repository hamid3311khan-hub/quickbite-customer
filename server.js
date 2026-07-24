require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const PDFDocument = require('pdfkit');
const multer = require('multer');
const cron = require('node-cron'); // NAYA - auto settlement ke liye
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

// ===== MODELS - UPDATE KIYE =====
const MenuItem = mongoose.model('MenuItem', {
    name: String, price: Number, category: String, desc: String,
    image: String, veg: Boolean, inStock: {type:Boolean, default:true}, offer: Number,
    restaurantId: {type: String, default: 'default-shop'}
});

const RestaurantOwner = mongoose.model('RestaurantOwner', {
    restaurantId: {type: String, unique: true},
    restaurantName: String, ownerName: String, mobile: {type: String, unique: true},
    email: {type: String, unique: true}, address: String, password: String,
    status: {type: String, default: "Pending"}, plan_status: {type: String, default: "Trial"},
    registration_fee_paid: {type: Number, default: 200}, payment_proof: {type: String, default: null},
    trial_end_date: {type: Date}, payout_due: {type: Number, default: 0}, // NAYA
    paymentStatus: {type: String, default: "Paid"}, lastPaymentDate: {type: Date, default: Date.now},
    nextDueDate: {type: Date}, createdAt: {type: Date, default: Date.now}
});

// CHANGE: Rider me cash balance add
const Rider = mongoose.model('Rider', {
    name:String, fatherName:String, aadhar:String, pan:String,
    mobile:{type:String, unique:true}, aadharImg: String, panImg: String, photoImg: String,
    lat:Number, lng:Number, lastUpdate:Date, status:{type:String, default:"Pending"},
    restaurantId: {type: String},
    cash_balance: {type: Number, default: 0}, // NAYA: Rider ke paas kitna cash
    weekly_orders: {type: Number, default: 0}, // NAYA: Weekly count
    weekly_bonus: {type: Number, default: 0} // NAYA
});

// CHANGE: Order me hisaab ke field add
const OrderSchema = new mongoose.Schema({
    trackId: String, name:String, phone:String, address:String, items:[], 
    item_total: {type: Number, default: 0}, // NAYA
    commission_5: {type: Number, default: 0}, // NAYA
    platform_fee: {type: Number, default: 10}, // NAYA
    delivery_fee: {type: Number, default: 30}, // NAYA
    total:Number, // Grand Total
    cash_to_restaurant: {type: Number, default: 0}, // NAYA
    payment:String, status:{type:String, default:'Pending'}, 
    riderLat:Number, riderLng:Number, pointsEarned:Number,
    coupon:String, discount:Number, shopLat: {type:Number, default: 25.5941}, shopLng: {type:Number, default: 85.1376},
    custLat: Number, custLng: Number, riderId: String,
    restaurantId: {type: String, default: 'default-shop'},
    cash_deposited: {type: Boolean, default: false}, // NAYA
    cash_deposit_proof: {type: String, default: null}, // NAYA
    is_peak: {type: Boolean, default: false} // NAYA: bonus ke liye
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

// ===== HELPER FUNCTION: BILL CALCULATION =====
function calculateBill(item_total) {
    const commission_5 = Math.round(item_total * 0.05);
    const platform_fee = 10;
    const delivery_fee = 30;
    const grand_total = item_total + commission_5 + platform_fee + delivery_fee;
    const cash_to_restaurant = item_total; // Restaurant ko item ka paisa milega
    
    const hour = new Date().getHours();
    const is_peak = (hour >= 12 && hour <= 15) || (hour >= 19 && hour <= 22);
    
    return {item_total, commission_5, platform_fee, delivery_fee, grand_total, cash_to_restaurant, is_peak};
}

// ===== API ROUTES =====
app.get('/api/menu', async (req,res)=> {
    const shopId = req.query.shop || 'default-shop';
    const items = await MenuItem.find({restaurantId: shopId});
    res.json(items);
});

// CHANGE: Order create karte time bill banega
app.post('/api/orders', async (req,res)=>{
    const trackId = 'QB' + Date.now();
    const item_total = req.body.items.reduce((a,b)=>a+(b.price*b.qty), 0);
    const bill = calculateBill(item_total);
    const points = Math.floor(item_total / 10);
    
    const newOrder = await new Order({
        ...req.body, 
        trackId, 
        pointsEarned: points,
        ...bill
    }).save();
    
    const ownerData = await RestaurantOwner.findOne({restaurantId: newOrder.restaurantId});
    if(ownerData){ console.log(`Owner WA: https://wa.me/91${ownerData.mobile}?text=Naya Order: ${newOrder.trackId} - Total: ₹${bill.grand_total}`); }
    res.json({success:true, trackId, bill})
});

app.get('/api/orders', async (req,res)=>{
    const shop = req.query.shop;
    if(shop) return res.json(await Order.find({restaurantId: shop}).sort({createdAt:-1}));
    res.json(await Order.find().sort({createdAt:-1}))
});

// CHANGE: Order assign karne se pehle ₹500 check
app.put('/api/order/assign', async (req,res)=>{
    const rider = await Rider.findOne({mobile: req.body.riderId});
    if(!rider) return res.json({success:false, msg:"Rider nahi mila"})
    
    if(rider.cash_balance >= 500){ 
        return res.json({success:false, msg:"⚠️ ₹500 cash pending. Pehle jama karein."}) 
    }
    
    const busyOrder = await Order.findOne({ riderId: req.body.riderId, status: {$ne: 'Delivered'} });
    if(busyOrder){ return res.json({success:false, msg:"Ye rider abhi busy hai."}) }
    
    await Order.findByIdAndUpdate(req.body.orderId, { riderId: req.body.riderId, status: 'Out for Delivery' });
    res.json({success:true})
});

// CHANGE: Delivered hote hi rider ka cash badhega
app.post('/api/order/delivered', async (req,res)=>{ 
    const order = await Order.findById(req.body.orderId);
    if(!order) return res.json({success:false});
    
    await Order.findByIdAndUpdate(req.body.orderId, {status: 'Delivered'});
    await Rider.findOneAndUpdate({mobile: order.riderId}, {
        $inc: {cash_balance: order.delivery_fee, weekly_orders: 1}
    });
    res.json({success:true, msg:"Order Delivered Marked"}); 
});

// NAYA API: Rider Cash Jama karega
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const uploadFile = multer({ storage: storage });

app.post('/api/rider/cash-deposit', uploadFile.single('proof'), async (req,res)=>{
    const {riderId, amount, restaurantId} = req.body;
    await Order.updateMany({riderId, cash_deposited: false}, {
        cash_deposited: true, cash_deposit_proof: req.file.filename
    });
    await Rider.findOneAndUpdate({mobile: riderId}, {$set: {cash_balance: 0}});
    res.json({success:true, msg:`₹${amount} jama ho gaya. Restaurant confirm karega.`})
})

// NAYA API: Restaurant Cash Confirm karega
app.post('/api/restaurant/cash-confirm', async (req,res)=>{
    const {riderId} = req.body;
    // Yahan hum maan rahe hain cash mil gaya, ab payout_due me jodega
    const orders = await Order.find({riderId, cash_deposited: true});
    let total_cash = orders.reduce((a,b)=>a+b.cash_to_restaurant, 0);
    
    await RestaurantOwner.findOneAndUpdate({restaurantId: orders[0].restaurantId}, {
        $inc: {payout_due: total_cash}
    });
    res.json({success:true, msg:`₹${total_cash} confirm ho gaya`})
})

// NAYA API: Restaurant Payout karega
app.post('/api/restaurant/payout', async (req,res)=>{
    const {restaurantId} = req.body;
    await RestaurantOwner.findOneAndUpdate({restaurantId}, {$set: {payout_due: 0}});
    res.json({success:true, msg:"Payout ho gaya"})
})

// ===== CRON JOBS =====
// Raat 12 baje: 5% + ₹10 kaatna
cron.schedule('0 0 *', async () => {
    console.log("Running Auto Settlement...");
    const owners = await RestaurantOwner.find({status: "Approved"});
    for(let owner of owners){
        const today_orders = await Order.find({
            restaurantId: owner.restaurantId, 
            createdAt: {$gte: new Date(new Date().setHours(0,0,0,0))}
        });
        let cut = today_orders.reduce((a,b)=>a+b.commission_5+b.platform_fee, 0);
        await RestaurantOwner.findByIdAndUpdate(owner._id, {$inc: {payout_due: -cut}});
    }
});

// Har Somvaar 12 baje: Weekly Bonus
cron.schedule('0 0 * 1', async () => {
    console.log("Running Weekly Bonus...");
    const riders = await Rider.find();
    for(let rider of riders){
        let bonus = 0;
        if(rider.weekly_orders >= 30) bonus += 50;
        // Peak bonus hisaab yahan lagega
        await Rider.findByIdAndUpdate(rider._id, {
            $set: {weekly_orders: 0, weekly_bonus: bonus}
        });
    }
});

// BAKI KE ROUTE WAHI RAHE...
app.get('/api/restaurant/stats', async (req,res)=>{
    const shop = req.query.shop;
    const today = new Date(); today.setHours(0,0,0,0);
    const orders = await Order.find({ restaurantId: shop, createdAt: {$gte: today} });
    const revenue = orders.reduce((a,b)=>a+b.item_total, 0);
    const payout = await RestaurantOwner.findOne({restaurantId: shop});
    res.json({ orders: orders.length, revenue, payout_due: payout.payout_due || 0 })
})

// ... baki saare purane routes same

// CHANGE: NAYA BILL PDF - IRCTC FORMAT
app.get('/invoice', async (req,res)=>{
  const { id } = req.query;
  const order = await Order.findOne({trackId:id});
  if(!order) return res.status(404).send("Order not found");
  const doc = new PDFDocument({margin: 40});
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=QuickBite-${id}.pdf`);
  doc.pipe(res);
  doc.fontSize(22).text('QUICKBITE', {align: 'center'});
  doc.fontSize(10).text(`Order ID: ${order.trackId} | Date: ${order.createdAt.toLocaleDateString()}`, {align: 'center'});
  doc.moveDown();
  doc.text('-------------------------------------------');
  order.items.forEach(i=>{ doc.text(`${i.name} x ${i.qty}         ₹${i.price*i.qty}`); });
  doc.text('-------------------------------------------');
  doc.text(`Sub Total:                      ₹${order.item_total}`);
  doc.text(`GST 5%:                         ₹${order.commission_5}`);
  doc.text(`Delivery Fee:                   ₹${order.delivery_fee}`);
  doc.text(`Platform Fee:                   ₹${order.platform_fee}`);
  doc.text('-------------------------------------------');
  doc.fontSize(14).text(`Grand Total:                    ₹${order.total}`);
  doc.moveDown();
  doc.fontSize(10).text(`Payment: ${order.payment} | Rider: ${order.riderId}`);
  doc.end();
})

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
// ... baki routes same

server.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));