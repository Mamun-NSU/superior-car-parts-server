const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r2by2.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// This function is used to check where the user is logIn or not
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    // This is parts/products collection
    const partsCollection = client
      .db("manufacturer-website")
      .collection("parts");

    const reviewsCollection = client
      .db("manufacturer-website")
      .collection("reviews");

    // This is orders collection by users
    const ordersCollection = client
      .db("manufacturer-website")
      .collection("orders");

    // This is users collections      
    const userCollection = client
      .db("manufacturer-website")
      .collection("users");

    const paymentCollection = client
      .db("manufacturer-website")
      .collection("payments");

    // This verifyAdmin function check, where the user is admin or not  
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    // Only login users can make payments
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.order_price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // ALL Parts API here
    //GET ALL PARTS
    app.get("/parts", async (req, res) => {
      const query = {};
      const cursor = partsCollection.find(query);
      const parts = await cursor.toArray();
      res.send(parts);
    });

    // GET ONE PART
    app.get("/parts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const part = await partsCollection.findOne(query);
      res.send(part);
    });

    // POST (add) one part and only admin can added parts
    app.post("/parts", verifyJWT, verifyAdmin, async (req, res) => {
      const newPart = req.body;
      const result = await partsCollection.insertOne(newPart);
      res.send(result);
    });

    // DELETE one part and only admin can added parts
    app.delete("/parts/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await partsCollection.deleteOne(query);
      res.send(result);
    });

    // ALL ORDERS API here

    //GET  ALL ORDERS only logIn user can get his/her all orders and the admin gets all the orders

    app.get("/orders", verifyJWT, async (req, res) => {
      const user_email = req.query.user_email;

      let query = {};
      if (user_email) {
        query = { user_email: user_email };
      }

      const cursor = ordersCollection.find(query);
      const parts = await cursor.toArray();
      res.send(parts);
    });

    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const order = await ordersCollection.findOne(query);
      res.send(order);
    });

    // POST (add) one order and user can add order one by one 
    app.post("/orders", async (req, res) => {
      const newOrder = req.body;
      const result = await ordersCollection.insertOne(newOrder);
      res.send(result);
    });

    // when user paid for a order, then paid status become true
    app.patch("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const result = await paymentCollection.insertOne(payment);
      const updatedOrder = await ordersCollection.updateOne(filter, updatedDoc);
      res.send(updatedOrder);
    });
    // API for DELETE one order
    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    //ALL REVIEW API here
    //GET for REVIEWS
    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewsCollection.find(query);
      const parts = await cursor.toArray();
      res.send(parts);
    });
    //POST for REVIEWS
    app.post("/reviews", async (req, res) => {
      const newPart = req.body;
      const result = await reviewsCollection.insertOne(newPart);
      res.send(result);
    });

    // This area for Users API's
    app.get("/user", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
      console.log(user);
    });

    // API for make an user ADMIN; only an admin make another user as admin
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //This API for users update
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });


    // DELETE one User; only admin can delete other user
    app.delete("/user/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello! This is inside from MANUFACTURER ");
});

app.listen(port, () => {
  console.log(`MANUFACTURER SERVER listening on port ${port}`);
});
