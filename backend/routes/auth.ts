import express from 'express';

const router=express.Router();

router.get('/login',(req,res)=>{
  res.send("Login Portal");
})

router.post('/signup',(req,res)=>{
  res.send("Signup Portal");
})

export default router;