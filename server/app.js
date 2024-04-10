const express= require('express');
const bcryptjs=require('bcryptjs')
const jwt=require('jsonwebtoken');
const cors=require('cors');
const io=require('socket.io')(8080,{
    cors:{
        origin:'http://localhost:3000',
    }
});

const app=express();

//connection with database
require('./db/connection');

//import models
const Users=require('./models/Users');
const Conversations=require('./models/Conversations');
const Messages = require('./models/Messages');


const port=process.env.PORT || 8000;


app.use(express.json());
app.use(express.urlencoded({extended:false}));
app.use(cors())

let users=[]
io.on('connection', socket=>{
    console.log(socket.id);
    socket.on('addUser', userId=>{
        const isUserExist= users.find(user=> user.userId === userId);
        if(!isUserExist){
            const user= { userId, socketId: socket.id};
            users.push(user);
            io.emit('getUsers', users);
        }
    })

    socket.on('sendMessage' , async ({senderId, receiverId, message, conversationId})=>{
        console.log(senderId);
        console.log(receiverId);
        console.log(message);
        console.log(conversationId);
        const receiver= users.find(user=> user.userId === receiverId);
        const sender= users.find(user => user.userId === senderId);

        // console.log("rec",receiver.socketId);
        // console.log("sen",sender.socketId);
    
        const user=  await Users.findById(senderId);
    
        if(receiver){
            io.to(receiver.socketId).to(sender.socketId).emit('getMessage',{
                senderId,
                message,
                conversationId,
                receiverId,
                user:{id: user._id, fullName: user.fullName, email:user.email}
            });
        }
        else{
            io.to(sender.socketId).emit('getMessage',{
                senderId,
                message,
                conversationId,
                receiverId,
                user:{id: user._id, fullName: user.fullName, email:user.email}
            });
        }
    });

    socket.on('disconnect', ()=>{
        users=users.filter(user => user.socketId !== socket.id);
        io.emit('getUsers', users);
    })
});



//Routes
app.get('/',(req,res)=>{
    res.send('Welcome');
})

app.post('/api/register', async (req,res,next)=>{
    try{
        const {fullName,email,password} =req.body;
        console.log(req.body);
        if(!fullName || !email || !password){
            res.status(400).send('Please fill all fields');
        }
        else{
            const isAlreadyExist =  await Users.findOne({email});
            console.log(isAlreadyExist);
            if(isAlreadyExist){
                res.status(400).send('User already Exists');
            }else{
                const newUser= new Users({fullName,email});
                bcryptjs.hash(password,10,(err,hashedPassword)=>{
                    newUser.set('password',hashedPassword);
                    newUser.save();
                    next();
                })
                console.log("here");
                return res.status(200).send({register:true});
            }

        }
    }catch(error){
        console.log(error);
    }
})

app.post('/api/login', async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).send("Fill required fields");
    } else {
        try {
            const user = await Users.findOne({ email }); // Using findOne instead of find
            if (!user) {
                res.status(400).send("Incorrect username or password");
            } else {
                const validateUser = await bcryptjs.compare(password, user.password); // Corrected argument order

                if (!validateUser) {
                    res.status(400).send("Incorrect password");
                } else {
                    const payload = {
                        userId: user._id,
                        email: user.email
                    };

                    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "Darshan Rathod";

                    jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
                        if (err) {
                            throw err;
                        }
                        await Users.updateOne({ _id: user._id }, {
                            $set: { token }
                        });
                        res.status(200).send({ user, token }); // Sending token in response
                    });
                }
            }
        } catch (error) {
            next(error); // Pass any error to error handling middleware
        }
    }
});

app.post('/api/conversation',async (req,res,next)=>{
    try{
        const{senderId,receiverId}= req.body;

        const newConversation=new Conversations({members: [senderId,receiverId]});

        await newConversation.save();

        res.status(200).send("Conversation created successfully");
    }catch(error){
            console.log(error);
    }
});

app.get('/api/conversation/:userId',async (req,res)=>{
    try {
        const userId=req.params.userId;
        const conversations= await Conversations.find({members:{$in:[userId]}});
        const conversationUserData= Promise.all(conversations.map(async (conversation)=>{
            const receiverId= conversation.members.find((member)=> member!==userId);
            const user=await Users.findById(receiverId);
            return {user: {receiverId:user._id,email:user.email,fullName:user.fullName},conversationId:conversation._id}
        }))
        res.status(200).json( await conversationUserData);
    } catch (error) {
        
    }
})

app.post('/api/message', async (req,res)=>{
    try {
        const {senderId,message,receiverId} = req.body;
        const conversationId= req.query.conversationId;
        console.log(req.body);
        if(!senderId || !message) {
            res.status(400).send("fill required feilds")
        }
        if(conversationId === 'new' && receiverId){
            const newConversation = new Conversations({members: [senderId,receiverId] });
            await newConversation.save();
            const newMessage = new Messages({conversationId:newConversation._id, senderId, message});
            await newMessage.save();
            return res.status(200).send("Message sent successfully");
        }
        else if(conversationId === 'new' && !receiverId){
            return res.status(400).send("fill required fields");
        }
        const newMessage= new Messages({conversationId,senderId,message});
        await newMessage.save();
        res.status(200).send("Message sent successfully");
    } catch (error) {
        console.log(error);
    }
})

app.get('/api/message/:conversationId', async (req,res)=>{
    try {
        const checkMessages= async (conversationId)=>{
            // console.log(conversationId);
            const messages = await Messages.find({conversationId});
            // console.log(messages);c
            const messageUserData= Promise.all(messages.map(async (message)=>{
                const user = await Users.findById(message.senderId);
                return { user:{id:user._id,email:user.email, fullName:user.fullName}, message:message.message, conversationId:conversationId}
            }));
            res.status(200).json(await messageUserData);
        }
        const conversationId = req.params.conversationId;
        
        if(conversationId === 'new'){
            const checkConversation=  await Conversations.find({members:{$eq:[req.query.senderId,req.query.receiverId]}});
            // console.log(JSON.stringify(checkConversation[0]._id));
            if(checkConversation.length > 0){
                checkMessages(checkConversation[0]._id);
            }else{
                res.status(200).json([]);
            }
        }else{
            // console.log(conversationId);
            checkMessages(conversationId);
        }
    } catch (error) {
        console.log(error);
    }
})

app.get('/api/users/:userId', async (req,res)=>{
    const userId= req.params.userId;
    const users= await Users.find({_id: {$ne:userId}});
    const usersData= Promise.all(users.map( async (user)=>{
        return { user : {receiverId:user._id,email:user.email, fullName:user.fullName}, userId: user._id}
    }));
    res.status(200).send(await usersData);
})

app.listen(port,()=>{
    console.log('running..');
})