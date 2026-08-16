const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dns = require('dns');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const serverless = require('serverless-http');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

const app = express();
const uri = process.env.MONGODB_URI || "mongodb+srv://Unisphere:ba1383CmqhJmvkoI@cluster0.uq8amgm.mongodb.net/?appName=Cluster0";

function getSha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const PROJECT_PWD_HASH = getSha256('Naitik22');
const ADMIN_PWD_HASH_1 = getSha256('@Nai98tik.');
const ADMIN_PWD_HASH_2 = getSha256('@Nai98tik');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

let cachedClient = null;
let cachedDb = null;
let cachedCollection = null;

async function getStudentsCollection() {
  if (cachedCollection) return cachedCollection;
  
  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db("student_showcase");
  cachedCollection = cachedDb.collection("students");
  return cachedCollection;
}

app.use(async (req, res, next) => {
  try {
    req.studentsCollection = await getStudentsCollection();
    next();
  } catch (err) {
    console.error("DB Connection Error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

function verifyPasswordHandler(req, res) {
  const { passwordHash, password } = req.body;
  const isAdmin = (passwordHash === ADMIN_PWD_HASH_1) || 
                  (passwordHash === ADMIN_PWD_HASH_2) || 
                  (password === '@Nai98tik.') || 
                  (password === '@Nai98tik');
  const isProjectAuth = (passwordHash === PROJECT_PWD_HASH) || (password === 'Naitik22');

  if (isAdmin) {
    return res.json({ success: true, role: 'admin', token: 'ADMIN_GRANTED_' + ADMIN_PWD_HASH_1 });
  } else if (isProjectAuth) {
    return res.json({ success: true, role: 'user', token: 'AUTH_GRANTED_' + PROJECT_PWD_HASH });
  } else {
    return res.status(401).json({ success: false, error: 'Incorrect Password! Access Denied.' });
  }
}
app.post(['/api/verify-password', '/.netlify/functions/api/verify-password'], verifyPasswordHandler);

const getStudentsHandler = async (req, res) => {
  try {
    const students = await req.studentsCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch students" });
  }
};
app.get(['/api/students', '/.netlify/functions/api/students'], getStudentsHandler);

const addStudentHandler = async (req, res) => {
  try {
    const { fullName, collegeName, email, mobileNumber, websiteUrl, shortDescription, photo } = req.body;
    if (!fullName || !websiteUrl) {
      return res.status(400).json({ error: 'Full Name and Website URL are required.' });
    }
    const studentEmail = email || req.body.emailId || mobileNumber || 'student@gmail.com';
    const newStudent = {
      fullName: fullName.trim(),
      collegeName: collegeName ? collegeName.trim() : 'N/A',
      email: studentEmail.trim(),
      mobileNumber: studentEmail.trim(),
      websiteUrl: websiteUrl.trim().startsWith('http') ? websiteUrl.trim() : `https://${websiteUrl.trim()}`,
      shortDescription: shortDescription ? shortDescription.trim() : '',
      photo: photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      createdAt: new Date()
    };
    const result = await req.studentsCollection.insertOne(newStudent);
    res.status(201).json({
      message: 'Student project added successfully!',
      student: { _id: result.insertedId, ...newStudent }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to save student data." });
  }
};
app.post(['/api/students', '/.netlify/functions/api/students'], addStudentHandler);

const editStudentHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, collegeName, email, mobileNumber, websiteUrl, shortDescription, photo } = req.body;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Student ID format' });
    }
    const studentEmail = email || req.body.emailId || mobileNumber || 'student@gmail.com';
    const updateData = {
      fullName: fullName.trim(),
      collegeName: collegeName ? collegeName.trim() : 'N/A',
      email: studentEmail.trim(),
      mobileNumber: studentEmail.trim(),
      websiteUrl: websiteUrl.trim().startsWith('http') ? websiteUrl.trim() : `https://${websiteUrl.trim()}`,
      shortDescription: shortDescription ? shortDescription.trim() : ''
    };
    if (photo) updateData.photo = photo;
    const result = await req.studentsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Student record not found' });
    }
    res.json({ message: 'Student record updated successfully!', id });
  } catch (err) {
    res.status(500).json({ error: "Failed to update student" });
  }
};
app.put(['/api/students/:id', '/.netlify/functions/api/students/:id'], editStudentHandler);

const deleteStudentHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid Student ID format' });
    }
    const result = await req.studentsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Student record not found' });
    }
    res.json({ message: 'Student record deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete student" });
  }
};
app.delete(['/api/students/:id', '/.netlify/functions/api/students/:id'], deleteStudentHandler);

module.exports.handler = serverless(app);
