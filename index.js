import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// JWT Verification Middleware
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    const database = client.db('bookNookDB');
    const booksCollection = database.collection('books');
    const borrowsCollection = database.collection('borrows');

    // JWT Token Generation API
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET || 'secret_key', { expiresIn: '1h' });
      res.send({ token });
    });


    // 1. GET /books — get all books (public)
    app.get('/books', async (req, res) => {
      const cursor = booksCollection.find();
      const books = await cursor.toArray();
      res.send(books);
    });

    // 2. GET /books/:id — get one book
    app.get('/books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const book = await booksCollection.findOne(query);
      res.send(book);
    });
    // 3. POST /books — add a book
    app.post('/books', async (req, res) => {
      const newBook = req.body;
      newBook.createdAt = new Date();
      const result = await booksCollection.insertOne(newBook);
      res.send(result);
    });

    // 4. PATCH /books/:id — update a book
    app.patch('/books/:id', async (req, res) => {
      const id = req.params.id;
      const updatedBook = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          title: updatedBook.title,
          author: updatedBook.author,
          category: updatedBook.category,
          image: updatedBook.image,
          description: updatedBook.description,
          totalCopies: updatedBook.totalCopies
        }
      };
      const result = await booksCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // 5. DELETE /books/:id — delete a book
    app.delete('/books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.deleteOne(query);
      res.send(result);
    });

    


//=============================
app.get('/', (req, res) => {
  res.send('BookNook Server is running...');
});

app.listen(port, () => {
  console.log(`BookNook server running on port ${port}`);
});