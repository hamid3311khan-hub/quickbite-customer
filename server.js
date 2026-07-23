const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect('mongodb://localhost:27017/quickbazar')
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err => console.log(err));

const Rider = mongoose.model('Rider', {name:String, mobile:String, status:{type:String, default:'Approved'}});
const Order = mongoose.model('Order', {trackId:String, name:String, phone:String, address:String, total:Number, status:String, riderId:String, createdAt:{type:Date, default:Date.now}});

// ===== API =====
app.post('/api/rider/login', async (req,res) => {
    const {mobile} = req.body;
    let rider = await Rider.findOne({mobile});
    if(!rider) return res.json({success:false, msg:'Rider nahi mila'});
    rider = await Rider.findByIdAndUpdate(rider._id, {status: 'Online'}, {new:true});
    res.json({success:true, rider});
});

app.put('/api/rider/:id/status', async (req,res) => {
    await Rider.findByIdAndUpdate(req.params.id, req.body);
    res.json({success:true});
});

app.get('/api/rider/orders/:mobile', async (req,res) => {
    const orders = await Order.find({riderId:req.params.mobile, status:{$ne:'Delivered'}}).sort({createdAt:-1});
    res.json(orders);
});

app.post('/api/order/delivered', async (req,res) => {
    await Order.findByIdAndUpdate(req.body.orderId, {status:'Delivered'});
    res.json({success:true});
});

app.get('/api/track/:trackId', async (req,res) => {
    const order = await Order.findOne({trackId:req.params.trackId});
    if(!order) return res.json({success:false});
    res.json({success:true, order});
});

// ===== PAGES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));

app.listen(3000, () => console.log('🚀 Server on 3000'));