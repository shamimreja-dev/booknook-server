# BookNook Server 📚

BookNook is a small online library management system. This repository contains the backend REST API built with Express.js, MongoDB, and Better Auth.

## Live Server:
Live Website: https://booknook-client-sepia.vercel.app/
- **Server URL:https://booknook-server-2t5l.onrender.com
- **Client Repository:https://github.com/shamimreja-dev/booknook-client
- **Server Repository:https://github.com/shamimreja-dev/booknook-server
## Features

- RESTful API for managing books.
- MongoDB database integration.
- User authentication with Better Auth.
- Protected API routes using JWT verification.
- Add, update, view, and delete books.
- Borrow books and prevent duplicate borrowing.
- Automatically decrease available copies when a book is borrowed.
- Automatically restore copies when a book is returned.
- Users can manage their own books and borrowing records.
- CORS configuration for frontend integration.
- Environment-variable-based configuration.

## Technologies Used

- Node.js
- Express.js
- MongoDB
- Better Auth
- JSON Web Tokens (JWT)
- JavaScript (ES Modules)
- CORS
- dotenv