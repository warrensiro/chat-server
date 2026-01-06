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

  // load conversation
  socket.on("get_direct_conversations", async ({ user_id }, callback) => {
    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate("participants", "firstName lastName _id email status");
    console.log(existing_conversations);

    callback(existing_conversations);
  });

  socket.on("start_conversation", async (data) => {
    const { to, from } = data;

    const existing_conversation = await OneToOneMessage.find({
      participants: { $size: 2, $all: [to, from] },
    }).populate("participants", "firstName lastName _id email status");

    console.log("Existing Conversation", existing_conversation[0]);

    if (existing_conversation.length === 0) {
      let new_chat = await OneToOneMessage.create({
        participants: [to, from],
      });
      new_chat = await OneToOneMessage.findById(new_chat._id).populate(
        "participants",
        "firstName lastName _id email status"
      );
      console.log(new_chat);

      socket.emit("start_chat", new_chat);
    } else {
      socket.emit("start_chat", existing_conversation[0]);
    }
  });

  socket.on("get_messages", async (data, callback) => {
    const { messages } = await OneToOneMessage.findById(
      data.conversation_id
    ).select("messages");
    callback(messages);
  });

  // handle text/link messages
  socket.on("text_message", async (data) => {
    console.log("Received data", data);

    // data(to, from, text)
    const { to, from, message, conversation_id, type } = data

    const to_user = await User.findById(to)
    const from_user = await User.findById(from)

    const new_message = {
      to,
      from,
      type,
      text: message,
      created_at: Date.now()
    }
    // create a new convo
    const chat = await OneToOneMessage.findById(conversation_id)
    chat.messages.push(new_message)
    // save to db
    await chat.save({})
    // emit event
    io.to(to_user.socket_id).emit("new_message", {
      conversation_id,
      message: new_message,
    })
    io.to(from_user.socket_id).emit("new_message", {
      conversation_id,
      message: new_message,
    })
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
