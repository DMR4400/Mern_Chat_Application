const mongoose= require('mongoose');

const url='mongodb+srv://Darshan:Darshan@cluster0.021yqtn.mongodb.net/chat-app?retryWrites=true&w=majority&appName=Cluster0'

mongoose.connect(url,{
    useNewUrlParser:true,
    useUnifiedTopology:true
}).then(()=> console.log("connected to DB")).catch((e)=> console.log(e));