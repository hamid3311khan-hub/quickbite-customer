require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// uploads folder ban jaye
const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({origin: "*"}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// MongoDB
mongoose.connect(process.env.MONGO_URL)
.then(()=>console.log('✅ MongoDB Connected'))
.catch(err => console.log('Mongo Error:', err));

// Schema
const MenuItem = mongoose.model('MenuItem', {
    name: String, 
    price: Number, 
    category: String, 
    desc: String, 
    img: String, 
    veg: Boolean
});

// Multer - Local Storage
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req,file,cb)=> cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({storage});

// Routes
app.get('/api/menu', async (req,res)=> {
    try {
        const items = await MenuItem.find();
        res.json(items);
    } catch(err) {
        res.status(500).json({error: err.message});
    }
});

app.post('/api/menu', upload.single('img'), async (req,res)=>{
    try {
        const data = {
            ...req.body, 
            img: req.file ? `/uploads/${req.file.filename}` : 'https://via.placeholder.com/400',
            veg: req.body.veg === 'true'
        };
        await new MenuItem(data).save();
        res.json({success:true});
    } catch(err) {
        res.status(500).json({error: err.message});
    }
}); // <-- YE BRACKET IMPORTANT HAI

app.delete('/api/menu/:id', async (req,res)=>{ 
    try {
        await MenuItem.findByIdAndDelete(req.params.id); 
        res.json({success:true}); 
    } catch(err) {
        res.status(500).json({error: err.message});
    }
});

app.listen(PORT, ()=> console.log(`🚀 Server on ${PORT}`));