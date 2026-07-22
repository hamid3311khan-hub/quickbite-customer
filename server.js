require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { Server } = require("socket.io");
const PDFDocument = require('pdfkit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: {origin: "*"} });
const PORT = process.env.PORT || 10000;

const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({origin: "*"}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err => { console.log('Mongo Error:', err); process.exit(1) });

// ===== MODELS =====
const MenuItem = mongoose.model('MenuItem', { name: String, price: Number, category: String, desc: String, img: String, veg: Boolean, inStock: {type:Boolean, default:true}, offer: Number });
const Rider = mongoose.model('Rider', { name:String, fatherName:String, aadhar:String, pan:String, mobile:{type:String, unique:true}, aadharImg: String, panImg: String, photoImg: String, lat:Number, lng:Number, status:{type:String, default:"Pending"} });
const OrderSchema = new mongoose.Schema({ trackId: String, name:String, phone:String, address:String, items:[], total:Number, payment:String, status:{type:String, default:'Pending'}, riderLat:Number, riderLng:Number, pointsEarned:Number, coupon:String, discount:Number, shopLat: {type:Number, default: 25.5941}, shopLng: {type:Number, default: 85.1376}, custLat: Number, custLng: Number, riderId: String }, {timestamps: true});
const Order = mongoose.model('Order', OrderSchema);
const Coupon = mongoose.model('Coupon', {code:String, discount:Number, type:String});

const storage = multer.diskStorage({ destination: uploadDir, filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname) });
const upload = multer({storage});

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
    console.log('Rider Connected');
    socket.on('riderLocation', async (data) => {
        await Rider.findOneAndUpdate({mobile: data.mobile}, {lat: data.lat, lng: data.lng, status: "Online"});
        await Order.updateMany({riderId: data.mobile, status: "Out for Delivery"}, {riderLat: data.lat, riderLng: data.lng});
        io.emit('locationUpdate'); 
    });
    socket.on('disconnect', ()=> console.log('Rider Disconnected'));
});

// ===== API ROUTES =====
app.get('/api/menu', async (req,res)=> { const items = await MenuItem.find(); res.json(items); });
app.post('/api/menu', upload.single('img'), async (req,res)=>{ const data = {...req.body, img: req.file? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/400', veg: req.body.veg === 'true'}; await new MenuItem(data).save(); res.json({success:true}); });
app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });
app.put('/api/menu/:id/stock', async (req,res)=>{ const item = await MenuItem.findById(req.params.id); item.inStock =!item.inStock; await item.save(); res.json({success:true}); });
app.post('/api/orders', async (req,res)=>{ const trackId = 'QB' + Date.now(); const points = Math.floor(req.body.total / 10); await new Order({...req.body, trackId, pointsEarned: points}).save(); res.json({success:true, trackId}) });
app.get('/api/orders/track/:id', async (req,res)=>{ res.json(await Order.findOne({trackId:req.params.id})) });
app.get('/api/orders', async (req,res)=>{ res.json(await Order.find().sort({createdAt:-1})) });
app.get('/api/orders/history/:phone', async (req,res)=>{ res.json(await Order.find({phone:req.params.phone}).sort({createdAt:-1})) });
app.put('/api/orders/:id/status', async (req,res)=>{ const updated = await Order.findByIdAndUpdate(req.params.id, req.body, {new:true}); const waLink = `https://wa.me/91${updated.phone}?text=QuickBite Update%0AOrder: ${updated.trackId}%0AStatus: ${updated.status}`; res.json({success:true, customerWaLink: waLink}) });
app.delete('/api/orders/:id', async (req,res)=>{ await Order.findByIdAndDelete(req.params.id); res.json({success:true}) });
app.post('/api/order/delivered', async (req,res)=>{ try{ const order = await Order.findOne({trackId: req.body.orderId}); if(!order) return res.json({success:false, msg:"Order nahi mila"}); order.status = "Delivered"; await order.save(); res.json({success:true, msg:"Order Delivered ho gaya!"}); }catch(e){ res.json({success:false, msg:e.message}) } })

// ===== NAYA INVOICE PDF ROUTE =====
app.get('/invoice', async (req,res)=>{
  const { id } = req.query;
  if(!id) return res.send('Order ID nahi diya');
  const order = await Order.findOne({trackId:id});
  if(!order) return res.send('Order nahi mila');
  const doc = new PDFDocument({margin: 40});
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=QuickBite-${id}.pdf`);
  doc.pipe(res);
  doc.fontSize(22).text('QuickBite', {align: 'center'});
  doc.moveDown(0.5);
  doc.fontSize(14).text('INVOICE', {align: 'center'});
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Order ID: ${order.trackId}`);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`);
  doc.text(`Customer: ${order.name}`);
  doc.text(`Phone: ${order.phone}`);
  doc.text(`Address: ${order.address}`);
  doc.moveDown();
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold');
  doc.text('Item', 40); doc.text('Qty', 300); doc.text('Price', 370); doc.text('Total', 460);
  doc.font('Helvetica'); doc.moveDown(0.3);
  order.items.forEach(i=>{
    doc.text(i.name, 40); doc.text(i.qty, 300); 
    doc.text(`₹${i.price}`, 370); doc.text(`₹${i.price*i.qty}`, 460);
    doc.moveDown(0.5);
  });
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(14).font('Helvetica-Bold');
  doc.text(`Grand Total: ₹${order.total}`, 370);
  doc.moveDown(2);
  doc.fontSize(10).font('Helvetica').text('Thank you for ordering with QuickBite!', {align: 'center'});
  doc.end();
})

// ===== RIDER API - YE THEEK KIYA HAI =====
app.post('/api/rider/register', upload.fields([
    { name: 'aadharImg', maxCount: 1 }, 
    { name: 'panImg', maxCount: 1 }, 
    { name: 'photoImg', maxCount: 1 }
]), async (req,res)=>{ 
    try{ 
        const {name, fatherName, aadhar, pan, mobile} = req.body; 
        const files = req.files; 
        
        if(!name || !fatherName || !aadhar || !pan || !mobile) {
            return res.json({success: false, msg: 'Sabhi details bharna zaroori hai'});
        }
        
        if(!files.aadharImg || !files.panImg || !files.photoImg) {
            return res.json({success: false, msg: '3no photo upload karna zaroori hai'});
        }
        
        const r = new Rider({
            ...req.body, 
            aadharImg: `/uploads/${files.aadharImg[0].filename}`, 
            panImg: `/uploads/${files.panImg[0].filename}`, 
            photoImg: `/uploads/${files.photoImg[0].filename}`
        }); 
        
        await r.save(); 
        res.json({success: true, msg: 'Register ho gaya. Admin approval pending hai'}); 
    
    }catch(e){ 
        if(e.code === 11000) {
            return res.json({success: false, msg: 'Ye mobile pehle se register hai'});
        }
        res.json({success: false, msg: 'Error: ' + e.message}); 
    } 
});

app.post('/api/rider/login', async (req,res)=>{ let rider = await Rider.findOne({mobile: req.body.mobile}); if(!rider) return res.json({success:false, msg:"Mobile register nahi hai"}); if(!['Approved','Online'].includes(rider.status)) return res.json({success:false, msg:"Approval pending hai"}); await Rider.findOneAndUpdate({mobile: req.body.mobile}, {status: "Online"}); res.json({success:true, rider}); });

app.get('/api/rider/orders/:mobile', async (req,res)=>{ const orders = await Order.find({riderId: req.params.mobile, status: {$ne: 'Delivered'}}).sort({createdAt:-1}); res.json(orders); })

app.get('/api/riders/approved', async (req,res)=> res.json(await Rider.find({status: {$in: ['Approved','Online']}})) );
app.put('/api/rider/:id/approve', async (req,res)=>{ await Rider.findByIdAndUpdate(req.params.id, {status: 'Approved'}); res.json({success: true}); })
app.delete('/api/riders/:id', async (req,res)=>{ await Rider.findByIdAndDelete(req.params.id); res.json({success:true}); })
app.post('/api/riders/bulk-delete', async (req,res)=>{ await Rider.deleteMany({mobile: req.body.mobile}); res.json({success:true, msg:`${req.body.mobile} wale saare rider delete ho gaye`}) })
app.get('/api/riders', async (req,res)=> res.json(await Rider.find()) );

// 1 RIDER = 1 ORDER WALA RULE
app.put('/api/order/assign', async (req,res)=>{ 
  const busyOrder = await Order.findOne({ riderId: req.body.riderId, status: {$ne: 'Delivered'} });
  if(busyOrder){ return res.json({success:false, msg:"Ye rider abhi busy hai. Pehle wala order complete karega tabhi naya milega"}) }
  await Order.findByIdAndUpdate(req.body.orderId, { riderId: req.body.riderId, status: 'Out for Delivery' }); 
  res.json({success:true}) 
});

// Busy check API
app.get('/api/rider/check-busy/:mobile', async (req,res)=>{ const busy = await Order.findOne({riderId: req.params.mobile, status: {$ne: 'Delivered'}}); res.json({free: !busy}); })

app.post('/api/coupon', async (req,res)=>{ await new Coupon(req.body).save(); res.json({success:true}) });
app.post('/api/coupon/validate', async (req,res)=>{ const coupon = await Coupon.findOne({code:req.body.code}); if(coupon) { res.json({success:true,...coupon._doc}) } else { res.json({success:false}) } });
app.get('/api/stats', async (req,res)=>{ const orders = await Order.countDocuments(); const customers = await Order.distinct('phone').then(a=>a.length); res.json({orders, customers}) });
app.get('/api/report', async (req,res)=>{ const {start, end} = req.query; const endDate = new Date(end); endDate.setHours(23,59,59); const orders = await Order.find({createdAt: {$gte: new Date(start), $lte: endDate}}); const totalRevenue = orders.reduce((a,b)=>a+b.total,0); res.json({totalRevenue, totalOrders:orders.length, topItems:[]}) });
app.post('/api/broadcast', async (req,res)=>{ const {message, type, numbers} = req.body; let phones = []; if(type === 'all'){ phones = await Order.distinct('phone'); } else if(type === 'new'){ phones = []; return res.json({count: 0, links: [], msg: "New customer DB nahi hai abhi"}) } else { phones = numbers.split(',').map(n=>n.trim()); } const links = phones.map(p => `https://wa.me/91${p}?text=${encodeURIComponent(message)}`); res.json({count: phones.length, links}); });

// ===== PAGE ROUTES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/order-details', (req, res) => res.sendFile(path.join(__dirname, 'public', 'track.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));
app.get('/rider-register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider-register.html')));
// NAYA UPLOAD SYSTEM - CLOUDINARY
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({ 
  cloud_name: 'yaha_apna_cloud_name', 
  api_key: 'yaha_api_key', 
  api_secret: 'yaha_api_secret' 
});

const storageCloud = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'quickbite_test' }
});
const uploadCloud = multer({ storage: storageCloud });

// NAYA TEST WALA PAGE
app.get('/photo-test', (req,res)=>{
  res.send(`
    <form action="/photo-test" method="POST" enctype="multipart/form-data">
      <h2>Photo Upload Test</h2>
      <input type="file" name="photo">
      <button>Upload Karo</button>
    </form>
  `)
})

app.post('/photo-test', uploadCloud.single('photo'), (req,res)=>{
  res.send("Photo ka link: " + req.file.path)
})
server.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));