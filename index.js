const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(
  cors({
    //client side attached
    origin: [
      "http://localhost:5173",
      "https://job-portal-9a1f7.web.app",
      "https://job-portal-9a1f7.firebaseapp.com"

    ],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());


const logger=(req,res,next)=>{
  console.log("Inside the logger");
  next();
}

const verifyToken=(req,res,next)=>{
  // console.log("inside verify token middleware",req.cookies);
  const token=req?.cookies?.token;
  if(!token){
    return res.status(401).send({message:"unauthorized access"})
  }
  //verify token
  jwt.verify(token,process.env.JWT_SECRET,(err,decoded)=>{
    if(err){
      return res.status(401).send({message:"unauthorized access"})
    }

    req.user=decoded;
    next();
    
  })
  

}

//routes
app.get("/", async (req, res) => {
  res.send("Job is falling from the sky");
});

//db

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jajx6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );

    //jobs related apis
    const jobsCollection = client.db("JobPortal").collection("jobs");
    const jobApplicationCollection = client
      .db("JobPortal")
      .collection("job-application");

    //auth related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "10h",
      });
      res.cookie("token", token, {
          httpOnly: true,
          // secure: false, //true for https production
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          
        })
        //localhost:5000 and localhost:5173 are treated as same site.  so sameSite value must be strict in development server.  in production sameSite will be none
// in development server secure will false .  in production secure will be true
        .send({ success: true });
    });

    app.post('/logout',(req,res)=>{
      res.clearCookie('token',{
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",

      })
      .send({success:true})
    })



    app.get("/jobs", logger , async (req, res) => {
      console.log("Now inside the api callback");
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { hr_email: email };
      }
      const cursor = await jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob);
      res.send(result);
    });

    //job application apis
    //get all data,get one data,get some data[0,1, many]

    app.get("/job-application",verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { applicant_email: email };
      
      //token email !== query email
      if(req.user.email !== req.query.email){
        return res.status(403).send({message:"Forbidden access"})
      }
      const result = await jobApplicationCollection.find(query).toArray();
      // console.log("Cookies:",req.cookies);
      // not the best  way to aggregate data
      for (const application of result) {
        console.log(application.job_id);
        const query1 = { _id: new ObjectId(application.job_id) };
        const job = await jobsCollection.findOne(query1);
        if (job) {
          application.title = job.title;
          application.location = job.location;
          application.category = job.category;
          application.status = job.status;
          application.company = job.company;
          application.company_logo = job.company_logo;
        }
      }

      res.send(result);
    });

    // app.get('/job-application/:id')-->get a specific job application by id
    app.get("/job-applications/jobs/:job_id", async (req, res) => {
      const jobId = req.params.job_id;
      const query = { job_id: jobId };
      const result = await jobApplicationCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/job-application", async (req, res) => {
      const application = req.body;
      const result = await jobApplicationCollection.insertOne(application);

      //not the best way
      const id = application.job_id;
      const query = { _id: new ObjectId(id) };
      const job = await jobsCollection.findOne(query);
      let newCount = 0;
      if (job.applicationCount) {
        newCount = job.applicationCount + 1;
      } else {
        newCount = 1;
      }

      //now update the job info
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          applicationCount: newCount,
        },
      };

      const updateResult = await jobsCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    //query parameter:?name=value&name=value

    app.patch("/job-applications/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: data.status,
        },
      };
      const result = await jobApplicationCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//data collections

app.listen(port, () => {
  console.log(`Job is waiting at : ${port}`);
});
