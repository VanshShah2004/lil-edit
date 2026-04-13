import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth'
dotenv.config();

const app=express();
app.use(express.json());
app.use(cors());
const PORT = process.env.PORT || 5000;

app.use('/api/auth',authRouter);

app.get('/vansh',(req,res)=>{res.send('API running')});

app.listen(PORT,()=>console.log(`Server running on PORT ${PORT}`));