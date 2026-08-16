const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://Unisphere:ba1383CmqhJmvkoI@cluster0.uq8amgm.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    console.log("Connecting to MongoDB Atlas with custom DNS...");
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    const db = client.db("student_showcase");
    const count = await db.collection("students").countDocuments();
    console.log("Current student count in DB:", count);
  } catch (err) {
    console.error("DB Connection error:", err);
  } finally {
    await client.close();
  }
}
run();
