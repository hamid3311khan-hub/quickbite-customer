require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const PDFDocument = require('pdfkit');
const multer = require('multer');
const bcrypt = require('bcryptjs'); // <-- CHANGE KIYA
const upload = multer();

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
    restaurantId: {type: String, unique: true},
    restaurantName: String,
    ownerName: String,
    mobile: {type: String, unique: true},
    email: {type: String, unique: true},
    address: String,
    password: String,
    status: {type: String, default: "Pending"},
    plan_status: {type: String, default: "Trial"},
    registration_fee_paid: {type: Number, default: 200},
    payment_proof: {type: String, default: null},
    trial_end_date: {type: Date},
    paymentStatus: {type: String, default: "Paid"},
    lastPaymentDate: {type: Date, default: Date.now},
    nextDueDate: {type: Date},
    createdAt: {type: Date, default: Date.now}
});

const Rider = mongoose.model('Rider', {
    name:String, fatherName:String, aadhar:String, pan:String,
    mobile:{type:String, unique:true}, aadharImg: String, panImg: String, photoImg: String,
    lat:Number, lng:Number, lastUpdate:Date, status:{type:String, default:"Pending"},
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

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const uploadFile = multer({ storage: storage });

// ===== RESTAURANT OWNER APIs =====

// REGISTER - PASSWORD HASH + 30 DIN TRIAL
app.post('/api/restaurant/register', uploadFile.single('payment_proof'), async (req,res)=>{
    try{
        const {restaurantId, restaurantName, ownerName, mobile, email, address, password} = req.body;
        const exists = await RestaurantOwner.findOne({$or: [{mobile}, {email}, {restaurantId}]});
        if(exists) return res.json({success:false, msg: "Mobile/Email/ID pehle se hai"});

        const hashedPassword = await bcrypt.hash(password, 10); // HASH

        let trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 30); // 30 din ka trial

        await new RestaurantOwner({
            restaurantId, restaurantName, ownerName, mobile, email, address, 
            password: hashedPassword,
            status: "Pending",
            plan_status: "Trial",
            registration_fee_paid: 200,
            payment_proof: req.file.filename,
            trial_end_date: trialEnd
        }).save();
        res.json({success:true, msg: "Register ho gaya. Approval pending hai."})
    }catch(e){ res.json({success:false, msg:e.message}) }
});

// LOGIN - BCRYPT CHECK + DATA BHEJO
app.post('/api/restaurant/login', async (req,res)=>{
    const {email, password} = req.body;
    const owner = await RestaurantOwner.findOne({email});
    if(!owner) return res.json({success:false, msg: "Galat email ya password"});
    
    const isMatch = await bcrypt.compare(password, owner.password); // CHECK
    if(!isMatch) return res.json({success:false, msg: "Galat email ya password"});

    if(owner.status!== "Approved" && owner.status!== "Trial") return res.json({success:false, msg: "Approval pending hai"});
    
    res.json({success:true, owner: {
        _id: owner._id,
        restaurantId: owner.restaurantId,
        restaurantName: owner.restaurantName,
        email: owner.email,
        plan_status: owner.plan_status,
        trial_end_date: owner.trial_end_date
    }}) 
});

// APPROVE - TRIAL HI RAHNE DO
app.put('/api/restaurant/owner/:id/approve', async (req,res)=>{
    const owner = await RestaurantOwner.findByIdAndUpdate(req.params.id, {
        status: "Approved", 
        plan_status: "Trial"
    }, {new:true});
    const exists = await Restaurant.findOne({id: owner.restaurantId});
    if(!exists){
        await new Restaurant({id: owner.restaurantId, name: owner.restaurantName, address: owner.address, image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=200&fit=crop"}).save();
    }
    res.json({success:true});
});

app.get('/api/restaurant/owners', async (req,res)=> res.json(await RestaurantOwner.find().sort({createdAt:-1})) );
app.delete('/api/restaurant/owner/:id', async (req,res)=>{ await RestaurantOwner.findByIdAndDelete(req.params.id); res.json({success:true}); });

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
// ... baaki ke saare page routes yaha daal dena ...

server.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));