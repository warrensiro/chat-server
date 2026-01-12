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
const OneToOneMessage = require("./models/OneToOneMessage");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
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

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`App is running on port ${port}`);
});

// fired when client logs to our server
io.on("connection", async (socket) => {
  const { user_id } = socket.handshake.query;

  if (!user_id) return socket.disconnect();

  socket.user_id = user_id;
  console.log("User connected:", user_id);

  // mark user online
  await User.findByIdAndUpdate(user_id, {
    socket_id: socket.id,
    status: "Online",
  });

  // -------- Helper --------
  async function getSocketIdByUserId(userId) {
    const user = await User.findById(userId);
    return user?.socket_id || null;
  }

  // -------- Friend Requests --------
  socket.on("friend_request", async ({ to }) => {
    const from = socket.user_id;
    if (!to || to === from) return;

    const sender = await User.findById(from);
    const receiver = await User.findById(to);
    if (!sender || !receiver) return;

    if (sender.friends.includes(to)) return;

    const exists = await FriendRequest.findOne({
      $or: [
        { sender: from, recipient: to },
        { sender: to, recipient: from },
      ],
    });
    if (exists) return;

    const request = await FriendRequest.create({ sender: from, recipient: to });

    // notify recipient
    if (receiver.socket_id) {
      io.to(receiver.socket_id).emit("new_friend_request", {
        request_id: request._id,
        sender: {
          _id: sender._id,
          firstName: sender.firstName,
          lastName: sender.lastName,
        },
      });
    }

    // notify sender
    if (sender.socket_id) {
      io.to(sender.socket_id).emit("request_sent", {
        message: "Friend request sent",
      });
    }
  });

  socket.on("accept_request", async ({ request_id }) => {
    try {
      const request = await FriendRequest.findById(request_id);
      if (!request || request.recipient.toString() !== socket.user_id) return;

      const sender = await User.findById(request.sender);
      const receiver = await User.findById(request.recipient);
      if (!sender || !receiver) return;

      // add friends if not already
      if (!sender.friends.includes(receiver._id)) sender.friends.push(receiver._id);
      if (!receiver.friends.includes(sender._id)) receiver.friends.push(sender._id);

      await sender.save({ validateModifiedOnly: true });
      await receiver.save({ validateModifiedOnly: true });

      // create conversation if not exists
      let conversation = await OneToOneMessage.findOne({
        participants: { $size: 2, $all: [sender._id, receiver._id] },
      }).populate("participants", "firstName lastName _id email status");

      if (!conversation) {
        conversation = await OneToOneMessage.create({
          participants: [sender._id, receiver._id],
          messages: [],
        });
        conversation = await OneToOneMessage.findById(conversation._id).populate(
          "participants",
          "firstName lastName _id email status"
        );
      }

      await FriendRequest.findByIdAndDelete(request_id);

      // notify both users
      if (sender.socket_id) {
        io.to(sender.socket_id).emit("request_accepted", {
          message: `Friend request accepted by ${receiver.firstName} ${receiver.lastName}`,
          request_id: request._id,
          conversation,
        });
      }
      if (receiver.socket_id) {
        io.to(receiver.socket_id).emit("request_accepted", {
          message: `You accepted ${sender.firstName} ${sender.lastName}'s friend request`,
          request_id: request._id,
          conversation,
        });
      }
    } catch (err) {
      console.error("accept_request error:", err);
    }
  });

  // -------- Conversations --------
  socket.on("get_direct_conversations", async (_, callback) => {
    const conversations = await OneToOneMessage.find({
      participants: { $all: [socket.user_id] },
    }).populate("participants", "firstName lastName _id email status");

    callback(conversations || []);
  });

  socket.on("start_conversation", async ({ to }) => {
    const from = socket.user_id;
    if (!to || to === from) return;

    let conversation = await OneToOneMessage.findOne({
      participants: { $size: 2, $all: [to, from] },
    }).populate("participants", "firstName lastName _id email status");

    if (!conversation) {
      conversation = await OneToOneMessage.create({
        participants: [to, from],
        messages: [],
      });
      conversation = await OneToOneMessage.findById(conversation._id).populate(
        "participants",
        "firstName lastName _id email status"
      );
    }

    socket.emit("conversation_started", { conversation });
  });

  socket.on("get_messages", async (data, callback) => {
    const convo = await OneToOneMessage.findById(data.conversation_id).select("messages");
    callback(convo?.messages || []);
  });

  // -------- Messages --------
  socket.on("text_message", async (data) => {
    const { to, from, message, conversation_id, type } = data;
    if (!to || !from || !conversation_id || !message) return;

    const convo = await OneToOneMessage.findById(conversation_id);
    if (!convo) return;

    // check for duplicate by timestamp+text (optional)
    if (convo.messages.some((m) => m.text === message && m.from.toString() === from)) return;

    const newMessage = {
      from,
      to,
      text: message,
      type: type || "text",
      created_at: Date.now(),
    };

    convo.messages.push(newMessage);
    await convo.save();

    for (const userId of [to, from]) {
      const socketId = await getSocketIdByUserId(userId);
      if (socketId) {
        io.to(socketId).emit("new_message", { conversation_id, message: newMessage });
      }
    }
  });

  socket.on("file_message", (data) => {
    console.log("Received file message:", data);
    // implement S3 upload here
  });

  // Disconnect 
  socket.on("disconnect", async () => {
    await User.findByIdAndUpdate(socket.user_id, {
      status: "Offline",
      socket_id: null,
    });
    console.log("User disconnected:", socket.user_id);
  });
});
