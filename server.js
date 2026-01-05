const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("path");
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
const FriendRequest = require("./models/friendRequest");

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
  console.log(JSON.stringify(socket.handshake.query));
  const user_id = socket.handshake.query("user_id");

  const socket_id = socket.id;

  console.log(`User connected ${socket_id}`);

  if (Boolean(user_id)) {
    await User.findByIdAndUpdate(user_id, { socket_id, status: "Online" });
  }
  // socket event listeners
  socket.on("friend_request", async (data) => {
    console.log(data.to);
    // to is to the id in the server
    const to_user = await User.findById(data.to).select("socket_id");
    const from_user = await User.findById(data.from).select("socket_id");

    // create friend request
    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    });

    // send alert to user that they have received a request
    io.to(to_user.socket_id).emit("New_friend_request", {
      message: "New friend request received",
    });
    io.to(from_user.socket_id).emit("Request sent", {
      message: "Friend request sent",
    });
  });

  socket.on("accept_request", async (data) => {
    console.log(data);

    const request_doc = await FriendRequest.findById(data.request_id);

    console.log(request_doc);

    const sender = await User.findById(request_doc.sender);
    const receiver = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    receiver.friends.push(request_doc.sender);

    await receiver.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    // delete the friend request
    await FriendRequest.findByIdAndDelete(data.request_id);

    // send alert that request is accepted
    io.to(sender.socket_id).emit("Friend Request Accepted", {
      message: "Friend request accepted",
    });
    io.to(receiver.socket_id).emit("Friend Request Accepted", {
      message: "Friend request accepted",
    });
  });

  // handle text/link messages
  socket.on("text_message", (data) => {
    console.log("Received data", data);

    // data(to, from, text)

    // create a new convo

    // save to db

    // emit event
  });

  // handle media/document messages
  socket.on("file_message", (data) => {
    console.log("Received message", data);

    // get extension
    const fileExtension = path.extname(data.file.name);

    // generate unique file name
    const fileName = `${Date.now()}_${Math.floor(
      Math.random() * 1000
    )}${fileExtension}`;

    // upload file to s3
  });

  socket.on("end", async (data) => {
    // find user by id and have status to offline
    if (data.user_id) {
      await User.findByIdAndUpdate(data.user_id, { status: "Offline" });
    }

    // broadcast user is offline

    console.log("Closing connection");
    socket.disconnect(0);
  });
});
