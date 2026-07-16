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
app.get('/track', (req,res)=> res.sendFile(path.join(__dirname, 'public/myorder.html')));
app.get('/payment', (req,res)=> res.sendFile(path.join(__dirname, 'public/payment.html')));

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (