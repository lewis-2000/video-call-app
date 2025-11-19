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

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/lobby.html"));
});

// Room logic
io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    socket.join(roomId);

    // notify others
    socket.to(roomId).emit("user-joined", socket.id);

    // incoming offer
    socket.on("offer", ({ offer, to }) => {
      io.to(to).emit("offer", { offer, from: socket.id });
    });

    // incoming answer
    socket.on("answer", ({ answer, to }) => {
      io.to(to).emit("answer", { answer, from: socket.id });
    });

    // ICE candidates
    socket.on("candidate", ({ candidate, to }) => {
      io.to(to).emit("candidate", { candidate, from: socket.id });
    });

    // chat
    socket.on("chat-message", ({ text }) => {
      socket.to(roomId).emit("chat-message", { text, senderId: socket.id });
    });

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-left", socket.id);
    });
  });
});

// Render uses PORT env
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));
