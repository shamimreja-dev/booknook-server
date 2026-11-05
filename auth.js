import "dotenv/config";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing in environment variables");
}

const baseURL =
  process.env.BETTER_AUTH_URL || "https://booknook-server-2t5l.onrender.com";

const client = new MongoClient(uri);

const connectDB = async () => {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully for Auth!");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
};
connectDB();

const db = client.db(process.env.MONGODB_DATABASE || "bookNookDB");

export const auth = betterAuth({
  appName: "BookNook",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,

  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
    // Origin check বন্ধ থাকায় যেকোনো ডোমেইন থেকে লগআউট কাজ করবে
    disableOriginCheck: true,
  },

  database: mongodbAdapter(db, { client }),

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },

  plugins: [
    jwt({
      jwt: {
        issuer: baseURL,
        audience: baseURL,
        expirationTime: "15m",
      },
    }),
  ],
});