// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serve your HTML/CSS/JS

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room ${roomId}`);
    socket.to(roomId).emit("user-joined", socket.id);

    socket.on("offer", (data) =>
      socket.to(data.to).emit("offer", { ...data, from: socket.id })
    );
    socket.on("answer", (data) =>
      socket.to(data.to).emit("answer", { ...data, from: socket.id })
    );
    socket.on("candidate", (data) =>
      socket.to(data.to).emit("candidate", { ...data, from: socket.id })
    );

    socket.on("chat-message", (data) => {
      socket.to(roomId).emit("chat-message", { ...data, senderId: socket.id });
    });

    socket.on("disconnect", () =>
      socket.to(roomId).emit("user-left", socket.id)
    );
  });
});

const PORT = 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Signaling server running on port ${PORT}`);
});
