
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";

const BACKEND_URL =
  process.env.BETTER_AUTH_URL || "http://localhost:5000";

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Better Auth
app.all("/api/auth/{*any}", toNodeHandler(auth));

app.use(express.json());

// MongoDB
const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing in .env");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let booksCollection;
let borrowsCollection;
let usersCollection;

const JWKS = createRemoteJWKSet(
  new URL(`${BACKEND_URL}/api/auth/jwks`)
);

// ================= JWT MIDDLEWARE =================

async function verifyJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authorization token is required",
      });
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: BACKEND_URL,
      audience: BACKEND_URL,
    });

    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({
        message: "JWT user ID is missing",
      });
    }

    // Search using both string and ObjectId formats.
    const userConditions = [
      { _id: userId },
      { id: userId },
    ];

    if (ObjectId.isValid(userId) && String(new ObjectId(userId)) === userId) {
      userConditions.push({
        _id: new ObjectId(userId),
      });
    }

    const user = await usersCollection.findOne({
      $or: userConditions,
    });

    if (!user) {
      console.error("Authenticated user not found.");
      console.error("JWT subject:", userId);
      console.error("User collection:", "user");

      return res.status(401).json({
        message: "Authenticated user not found",
      });
    }

    req.user = {
      id: String(user.id || user._id),
      name: user.name || "",
      email: user.email || "",
      image: user.image || "",
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      message: "Invalid or expired JWT",
    });
  }
}

// ================= USER API =================

app.get("/users/me", verifyJWT, (req, res) => {
  res.json({ user: req.user });
});

// ================= BOOK APIs =================

// Get all books
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.json(books);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch books" });
  }
});

// Get one book
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book ID" });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json(book);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch book" });
  }
});

// Add book
app.post("/books", verifyJWT, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
    } = req.body;

    if (
      !title?.trim() ||
      !author?.trim() ||
      !category?.trim() ||
      !image?.trim() ||
      !description?.trim()
    ) {
      return res.status(400).json({
        message: "All book fields are required",
      });
    }

    const copies = Number(totalCopies);

    if (!Number.isInteger(copies) || copies < 1) {
      return res.status(400).json({
        message: "Total copies must be a positive integer",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      image: image.trim(),
      description: description.trim(),
      totalCopies: copies,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);

    res.status(201).json({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to add book" });
  }
});

// Update own book
app.patch("/books/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book ID" });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    if (book.userId !== req.user.id) {
      return res.status(403).json({
        message: "You can only update your own books",
      });
    }

    const allowedFields = [
      "title",
      "author",
      "category",
      "image",
      "description",
    ];

    const updateDoc = {};

    for (const field of allowedFields) {
      const value = req.body[field];

      if (typeof value === "string" && value.trim()) {
        updateDoc[field] = value.trim();
      }
    }

    if (req.body.totalCopies !== undefined) {
      const copies = Number(req.body.totalCopies);

      if (!Number.isInteger(copies) || copies < 0) {
        return res.status(400).json({
          message: "Total copies must be zero or greater",
        });
      }

      const activeBorrows = await borrowsCollection.countDocuments({
        bookId: id,
      });

      if (copies < activeBorrows) {
        return res.status(400).json({
          message: `At least ${activeBorrows} copies are borrowed`,
        });
      }

      updateDoc.totalCopies = copies;
    }

    if (Object.keys(updateDoc).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided",
      });
    }

    updateDoc.updatedAt = new Date();

    await booksCollection.updateOne(
      { _id: new ObjectId(id), userId: req.user.id },
      { $set: updateDoc }
    );

    res.json({ message: "Book updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update book" });
  }
});

// Delete own book
app.delete("/books/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid book ID" });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!book) {
      return res.status(404).json({
        message: "Book not found or you do not own this book",
      });
    }

    const activeBorrows = await borrowsCollection.countDocuments({
      bookId: id,
    });

    if (activeBorrows > 0) {
      return res.status(400).json({
        message: "Cannot delete a borrowed book",
      });
    }

    await booksCollection.deleteOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    res.json({ message: "Book deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete book" });
  }
});

// ================= BORROW APIs =================

// Borrow book
app.post("/borrows", verifyJWT, async (req, res) => {
  try {
    const { bookId, borrowDate, returnDate } = req.body;

    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "Invalid book ID" });
    }

    if (!borrowDate || !returnDate) {
      return res.status(400).json({
        message: "Borrow date and return date are required",
      });
    }

    const borrowTime = new Date(borrowDate);
    const returnTime = new Date(returnDate);

    if (
      Number.isNaN(borrowTime.getTime()) ||
      Number.isNaN(returnTime.getTime()) ||
      returnTime <= borrowTime
    ) {
      return res.status(400).json({
        message: "Invalid borrow or return date",
      });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId,
      userId: req.user.id,
    });

    if (existingBorrow) {
      return res.status(409).json({
        message: "You have already borrowed this book",
      });
    }

    const stockResult = await booksCollection.updateOne(
      {
        _id: new ObjectId(bookId),
        totalCopies: { $gt: 0 },
      },
      {
        $inc: { totalCopies: -1 },
      }
    );

    if (stockResult.modifiedCount !== 1) {
      return res.status(400).json({
        message: "Book is not available",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(bookId),
    });

    const borrowData = {
      bookId,
      bookTitle: book.title,
      bookImage: book.image || "",
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      borrowDate: borrowTime,
      returnDate: returnTime,
      createdAt: new Date(),
    };

    try {
      const result = await borrowsCollection.insertOne(borrowData);

      res.status(201).json({
        message: "Book borrowed successfully",
        insertedId: result.insertedId,
      });
    } catch (error) {
      await booksCollection.updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { totalCopies: 1 } }
      );

      throw error;
    }
  } catch (error) {
    console.error("Borrow error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already borrowed this book",
      });
    }

    res.status(500).json({ message: "Failed to borrow book" });
  }
});

// Get my borrowed books
app.get("/borrows", verifyJWT, async (req, res) => {
  try {
    const borrows = await borrowsCollection
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(borrows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch borrowed books",
    });
  }
});

// Return book
app.delete("/borrows/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid borrow ID" });
    }

    const borrow = await borrowsCollection.findOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (!borrow) {
      return res.status(404).json({
        message: "Borrow record not found",
      });
    }

    const deleteResult = await borrowsCollection.deleteOne({
      _id: new ObjectId(id),
      userId: req.user.id,
    });

    if (deleteResult.deletedCount !== 1) {
      return res.status(409).json({
        message: "Borrow record already returned",
      });
    }

    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { totalCopies: 1 } }
    );

    res.json({ message: "Book returned successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to return book" });
  }
});

// ================= HEALTH CHECK =================

app.get("/", (req, res) => {
  res.send("BookNook Server is running...");
});

// ================= START SERVER =================

async function startServer() {
  try {
    await client.connect();

    const database = client.db(
      process.env.MONGODB_DATABASE || "bookNookDB"
    );

    booksCollection = database.collection("books");
    borrowsCollection = database.collection("borrows");

    // Better Auth default MongoDB user collection
    usersCollection = database.collection("user");

    console.log("Connected to MongoDB successfully!");
    console.log("User collection:", "user");

    app.listen(port, () => {
      console.log(`BookNook server running on port ${port}`);
      console.log(`Better Auth: ${BACKEND_URL}/api/auth`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
