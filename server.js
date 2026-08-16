const cluster = require('cluster');
const os = require('os');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dns = require('dns');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Fix DNS resolution issues on Windows for mongodb+srv
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

const numCPUs = Math.min(os.cpus().length || 2, 4);
const PORT = process.env.PORT || 3000;
const uri = "mongodb+srv://Unisphere:ba1383CmqhJmvkoI@cluster0.uq8amgm.mongodb.net/?appName=Cluster0";

function getSha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Password Hashes for Verification
const PROJECT_PWD_HASH = getSha256('Naitik22');
const ADMIN_PWD_HASH_1 = getSha256('@Nai98tik.');
const ADMIN_PWD_HASH_2 = getSha256('@Nai98tik');

if (cluster.isMaster || cluster.isPrimary) {
  console.log(`=================================================`);
  console.log(` 🚀 MASTER LOAD BALANCER STARTED (PID: ${process.pid})`);
  console.log(` ⚡ Spawning ${numCPUs} Worker Server Instances...`);
  console.log(`=================================================`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('online', (worker) => {
    console.log(` [Load Balancer] Worker Server #${worker.id} (PID: ${worker.process.pid}) is ONLINE`);
  });

  cluster.on('exit', (worker, code, signal) => {
    console.log(` ⚠️ [Load Balancer] Worker #${worker.id} exited. Restarting worker...`);
    cluster.fork();
  });

} else {
  const workerId = cluster.worker.id;
  const app = express();

  app.use(cors());
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Served-By-Worker', `Worker-${workerId}`);
    res.setHeader('X-Worker-PID', process.pid);
    next();
  });

  app.use(express.static('public'));

  let db, studentsCollection;

  async function initDB() {
    try {
      const client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        }
      });
      await client.connect();
      db = client.db("student_showcase");
      studentsCollection = db.collection("students");

      if (workerId === 1) {
        const count = await studentsCollection.countDocuments();
        if (count === 0) {
          console.log(`[Worker #${workerId}] Seeding sample student records into MongoDB...`);
          const sampleStudents = [
            {
              fullName: "Aarav Sharma",
              collegeName: "IIT Bombay",
              email: "aarav.sharma@iitb.ac.in",
              mobileNumber: "aarav.sharma@iitb.ac.in",
              websiteUrl: "https://wikipedia.org",
              shortDescription: "Building next-gen AI platforms and full-stack web applications. Passionate about machine learning & open source.",
              photo: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
              createdAt: new Date()
            },
            {
              fullName: "Priya Patel",
              collegeName: "BITS Pilani",
              email: "priya.patel@bits-pilani.ac.in",
              mobileNumber: "priya.patel@bits-pilani.ac.in",
              websiteUrl: "https://github.com",
              shortDescription: "Frontend UI/UX engineer crafting beautiful pixel-perfect web experiences and intuitive user interfaces.",
              photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
              createdAt: new Date(Date.now() - 1000 * 60 * 60)
            },
            {
              fullName: "Naitik Kumar",
              collegeName: "Delhi Technological University",
              email: "naitik.kumar@dtu.ac.in",
              mobileNumber: "naitik.kumar@dtu.ac.in",
              websiteUrl: "https://google.com",
              shortDescription: "Full stack developer specializing in Node.js, Express, MongoDB and modern web solutions.",
              photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80",
              createdAt: new Date(Date.now() - 1000 * 60 * 120)
            }
          ];
          await studentsCollection.insertMany(sampleStudents);
          console.log(`[Worker #${workerId}] Sample students seeded successfully!`);
        }
      }
    } catch (err) {
      console.error(`[Worker #${workerId}] DB Connection Error:`, err);
    }
  }

  // Verify Password API - Handles Admin Panel & Project Add
  app.post('/api/verify-password', (req, res) => {
    const { passwordHash, password } = req.body;
    
    // Check if password is Admin Panel password (@Nai98tik. or @Nai98tik)
    const isAdmin = (passwordHash === ADMIN_PWD_HASH_1) || 
                    (passwordHash === ADMIN_PWD_HASH_2) || 
                    (password === '@Nai98tik.') || 
                    (password === '@Nai98tik');

    const isProjectAuth = (passwordHash === PROJECT_PWD_HASH) || (password === 'Naitik22');

    if (isAdmin) {
      console.log(`[Worker #${workerId}] Admin Panel Access Granted!`);
      return res.json({ success: true, role: 'admin', token: 'ADMIN_GRANTED_' + ADMIN_PWD_HASH_1 });
    } else if (isProjectAuth) {
      console.log(`[Worker #${workerId}] Add Project Access Granted!`);
      return res.json({ success: true, role: 'user', token: 'AUTH_GRANTED_' + PROJECT_PWD_HASH });
    } else {
      return res.status(401).json({ success: false, error: 'Incorrect Password! Access Denied.' });
    }
  });

  // Get all students
  app.get('/api/students', async (req, res) => {
    try {
      if (!studentsCollection) {
        return res.status(500).json({ error: "Database not connected" });
      }
      const students = await studentsCollection.find({}).sort({ createdAt: -1 }).toArray();
      res.json(students);
    } catch (err) {
      console.error(`[Worker #${workerId}] Error fetching students:`, err);
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });

  // Add new student
  app.post('/api/students', async (req, res) => {
    try {
      const { passwordHash, fullName, collegeName, email, mobileNumber, websiteUrl, shortDescription, photo } = req.body;

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

      const result = await studentsCollection.insertOne(newStudent);
      console.log(`[Worker #${workerId}] New Student '${newStudent.fullName}' inserted into MongoDB!`);
      
      res.status(201).json({
        message: 'Student project added successfully to MongoDB!',
        student: { _id: result.insertedId, ...newStudent }
      });
    } catch (err) {
      console.error(`[Worker #${workerId}] Error adding student:`, err);
      res.status(500).json({ error: "Failed to save student data to MongoDB." });
    }
  });

  // EDIT / UPDATE student by ID
  app.put('/api/students/:id', async (req, res) => {
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

      if (photo) {
        updateData.photo = photo;
      }

      const result = await studentsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Student record not found in MongoDB' });
      }

      console.log(`[Worker #${workerId}] Student ID ${id} updated successfully in MongoDB`);
      res.json({ message: 'Student record updated successfully!', id });
    } catch (err) {
      console.error(`[Worker #${workerId}] Error updating student:`, err);
      res.status(500).json({ error: "Failed to update student in MongoDB" });
    }
  });

  // DELETE student by ID
  app.delete('/api/students/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid Student ID format' });
      }

      const result = await studentsCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Student record not found in MongoDB' });
      }

      console.log(`[Worker #${workerId}] Student ID ${id} deleted from MongoDB`);
      res.json({ message: 'Student record deleted successfully from MongoDB', id });
    } catch (err) {
      console.error(`[Worker #${workerId}] Error deleting student:`, err);
      res.status(500).json({ error: "Failed to delete student from MongoDB" });
    }
  });

  initDB().then(() => {
    app.listen(PORT, () => {
      console.log(` Worker #${workerId} listening on http://localhost:${PORT}`);
    });
  });
}
