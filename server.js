const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// ✅ Serve everything inside "public" AS-IS
app.use(express.static(path.join(__dirname, "public")));

// ✅ When someone visits "/", serve lobby.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "lobby.html"));
});

// =======================
//  WebRTC Signaling Logic
// =======================
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);

    // Tell others in the room that someone joined
    socket.to(roomId).emit("user-joined", socket.id);

    // Receive offer and relay it
    socket.on("offer", ({ offer, to }) => {
      io.to(to).emit("offer", { offer, from: socket.id });
    });

    // Receive answer and relay it
    socket.on("answer", ({ answer, to }) => {
      io.to(to).emit("answer", { answer, from: socket.id });
    });

    // Relay ICE candidates
    socket.on("candidate", ({ candidate, to }) => {
      io.to(to).emit("candidate", { candidate, from: socket.id });
    });

    // Chat messages
    socket.on("chat-message", ({ text }) => {
      socket.to(roomId).emit("chat-message", {
        text,
        senderId: socket.id,
      });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      console.log(`${socket.id} left room ${roomId}`);
      socket.to(roomId).emit("user-left", socket.id);
    });
  });
});

// =======================
//  Start Server
// =======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
