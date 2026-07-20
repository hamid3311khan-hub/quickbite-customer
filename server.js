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

// MongoDB
mongoose.connect(process.env.MONGO_URL).then(()=>console.log('✅ MongoDB Connected'));

// Schema
const MenuItem = mongoose.model('MenuItem', {
    name: String, price: Number, category: String, 
    desc: String, img: String, veg: Boolean
});

// Multer - Local
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({storage});

// Routes
app.get('/api/menu', async (req,res)=> res.json(await MenuItem.find()));
app.post('/api/menu', upload.single('img'), async (req,res)=>{
    const data = {...req.body, img: req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/400'};
    await new MenuItem(data).save();
    res.json({success:true});
app.delete('/api/menu/:id', async (req,res)=>{ await MenuItem.findByIdAndDelete(req.params.id); res.json({success:true}); });

app.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));