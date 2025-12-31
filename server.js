const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
dotenv.config({ path: "./config.env" });

const { Server } = require("socket.io");

// error handling for uncaught exceptions and unhandled promise rejections
process.on("uncaughtException", (err) => {
  console.log(err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  server.close(() => {
    process.exit(1);
  });
});

const http = require("http");
const User = require("./models/user");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const DB = process.env.DBURL.replace("<db_password>", process.env.DBPASSWORD);

mongoose
  .connect(DB)
  .then(() => {
    console.log("DB connection successful");
  })
  .catch((err) => {
    console.log(err);
  });

const port = process.env.PORT || 8000;

server.listen(port, () => {
  console.log(`App is running on port ${port}`);
});

// fired when client logs to our server
io.on("connection", async (socket) => {
  console.log(socket);
  const user_id = socket.handshake.query("user_id");

  const socket_id = socket.id;

  console.log(`User connected ${socket_id}`);

  if (user_id) {
    await User.findByIdAndUpdate(user_id, { socket_id });
  }
  // socket event listeners
  socket.on("friend_request", async (data) => {
    console.log(data.to);
    // to is to the id in the server
    const to = await User.findById(data.to);

    // send alert to user that they habe received a request
    io.to(to.socket_id).emit("New_friend_request", {});
  });
});
