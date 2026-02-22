const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Call = require("./models/call");
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
    origin: "http://localhost:8000",
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

const callTimeouts = new Map();

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

  // 🔁 Mark all pending messages as delivered
  const conversations = await OneToOneMessage.find({
    participants: socket.user_id,
  });

  for (const convo of conversations) {
    const pendingMessages = convo.messages.filter(
      (m) => m.to.toString() === socket.user_id && m.status === "sent",
    );

    if (pendingMessages.length === 0) continue;

    // update DB
    await OneToOneMessage.updateOne(
      { _id: convo._id },
      {
        $set: {
          "messages.$[m].status": "delivered",
        },
      },
      {
        arrayFilters: [
          {
            "m.to": socket.user_id,
            "m.status": "sent",
          },
        ],
      },
    );

    // notify senders
    for (const msg of pendingMessages) {
      const senderSocket = await getSocketIdByUserId(msg.from);
      if (senderSocket) {
        io.to(senderSocket).emit("message_delivered", {
          conversation_id: convo._id,
          message_id: msg._id,
        });
      }
    }
  }

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

    console.log("FRIEND REQUEST CREATED:", request);

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
      if (!sender.friends.includes(receiver._id))
        sender.friends.push(receiver._id);
      if (!receiver.friends.includes(sender._id))
        receiver.friends.push(sender._id);

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
        conversation = await OneToOneMessage.findById(
          conversation._id,
        ).populate("participants", "firstName lastName _id email status");
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

  // Conversations
  socket.on("get_direct_conversations", async (_, callback) => {
    const conversations = await OneToOneMessage.find({
      participants: socket.user_id,
    })
      .select("_id participants messages updatedAt")
      .populate("participants", "firstName lastName _id email status")
      .sort({ updatedAt: -1 });

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
        "firstName lastName _id email status",
      );
    }

    socket.emit("conversation_started", { conversation });
  });

  socket.on("get_messages", async (data, callback) => {
    const convo = await OneToOneMessage.findById(data.conversation_id).select(
      "messages",
    );
    callback(convo?.messages || []);
  });

  // Messages
  socket.on("text_message", async (data) => {
    const { to, from, message, conversation_id, client_id, replyTo } = data;
    if (!to || !from || !conversation_id || !message) return;

    const convo = await OneToOneMessage.findById(conversation_id).populate(
      "participants",
      "firstName lastName _id",
    );
    if (!convo) return;

    // Prepare replyTo payload
    let replyToPayload = null;
    if (replyTo) {
      let originalMsg;

      // If replyTo is an object with _id (from client), find it in the conversation
      if (typeof replyTo === "object" && replyTo._id) {
        originalMsg = convo.messages.find(
          (m) => m._id.toString() === replyTo._id,
        );
      } else if (typeof replyTo === "string") {
        originalMsg = convo.messages.find((m) => m._id.toString() === replyTo);
      }

      if (originalMsg) {
        const participant = convo.participants.find(
          (p) => p._id.toString() === originalMsg.from.toString(),
        );
        replyToPayload = {
          _id: originalMsg._id,
          from: originalMsg.from,
          text: originalMsg.text,
          // Always send actual name
          fromName: participant
            ? `${participant.firstName} ${participant.lastName || ""}`.trim()
            : "Unknown",
        };
      }
    }

    const newMessage = {
      _id: new mongoose.Types.ObjectId(),
      client_id,
      from,
      to,
      text: message,
      type: "Text",
      createdAt: new Date(),
      status: "sent",
      replyTo: replyToPayload,
    };

    convo.messages.push(newMessage);
    await convo.save();

    // send to both users
    for (const userId of [from, to]) {
      const socketId = await getSocketIdByUserId(userId);
      if (socketId) {
        io.to(socketId).emit("new_message", {
          conversation_id,
          message: newMessage,
          participants: convo.participants.map((p) => p._id.toString()),
        });
      }
    }
  });

  socket.on("message_delivered", async ({ conversation_id, message_id }) => {
    if (!conversation_id || !message_id) return;

    await OneToOneMessage.updateOne(
      { _id: conversation_id },
      {
        $set: {
          "messages.$[m].status": "delivered",
        },
      },
      {
        arrayFilters: [
          {
            "m._id": message_id,
            "m.to": socket.user_id,
            "m.status": "sent",
          },
        ],
      },
    );

    const convo = await OneToOneMessage.findById(conversation_id);
    const senderId = convo.messages.find(
      (m) => m._id.toString() === message_id,
    )?.from;

    const senderSocket = await getSocketIdByUserId(senderId);
    if (senderSocket) {
      io.to(senderSocket).emit("message_delivered", {
        conversation_id,
        message_id,
      });
    }
  });

  socket.on("messages_read", async ({ conversation_id }) => {
    if (!conversation_id) return;

    const convo = await OneToOneMessage.findById(conversation_id);
    if (!convo) return;

    await OneToOneMessage.updateOne(
      { _id: conversation_id },
      {
        $set: {
          "messages.$[m].status": "read",
        },
      },
      {
        arrayFilters: [
          {
            "m.to": socket.user_id,
            "m.status": { $in: ["sent", "delivered"] },
          },
        ],
      },
    );

    const otherUserId = convo.participants.find(
      (id) => id.toString() !== socket.user_id,
    );

    const otherSocketId = await getSocketIdByUserId(otherUserId);
    if (otherSocketId) {
      io.to(otherSocketId).emit("messages_read", {
        conversation_id,
      });
    }
  });

  socket.on("message_reaction", async (data) => {
    const { conversation_id, message_id, emoji, from } = data;

    const convo = await OneToOneMessage.findById(conversation_id);
    if (!convo) return;

    const message = convo.messages.find(
      (m) => m._id.toString() === message_id.toString(),
    );
    if (message) {
      const existingIndex = message.reactions.findIndex(
        (r) => r.from.toString() === from.toString(),
      );

      if (existingIndex > -1) {
        // If the user clicked the SAME emoji, remove it (Toggle off)
        if (message.reactions[existingIndex].emoji === emoji) {
          message.reactions.splice(existingIndex, 1);
        } else {
          // If they clicked a DIFFERENT emoji, update it
          message.reactions[existingIndex].emoji = emoji;
        }
      } else {
        // New reaction
        message.reactions.push({ from, emoji });
      }

      await convo.save();

      // Broadcast the updated reactions array to all participants
      convo.participants.forEach(async (pId) => {
        const socketId = await getSocketIdByUserId(pId);
        if (socketId) {
          io.to(socketId).emit("new_reaction", {
            conversation_id,
            message_id,
            reactions: message.reactions,
          });
        }
      });
    }
  });

  socket.on("delete_message", async ({ conversation_id, message_id, from }) => {
    if (!conversation_id || !message_id) return;

    const convo = await OneToOneMessage.findById(conversation_id);
    if (!convo) return;

    // Only allow sender to delete their message
    const message = convo.messages.find((m) => m._id.toString() === message_id);
    if (!message) return;
    if (String(message.from) !== String(from)) return;

    // Remove message
    convo.messages = convo.messages.filter(
      (m) => m._id.toString() !== message_id,
    );
    await convo.save();

    // Notify all participants about the deletion
    io.to(conversation_id).emit("message_deleted", {
      conversation_id,
      message_id,
    });
  });

  socket.on("audio_call_request", async ({ to, conversation_id }) => {
    const from = socket.user_id;

    if (!to || !conversation_id) return;

    const conversation = await OneToOneMessage.findById(conversation_id);

    if (
      !conversation ||
      !conversation.participants.some(
        (p) => p.toString() === from.toString(),
      ) ||
      !conversation.participants.some((p) => p.toString() === to.toString())
    ) {
      return;
    }

    const receiver = await User.findById(to);

    // 🚫 Prevent calling offline users
    if (!receiver || receiver.status !== "Online") {
      socket.emit("user_offline");
      return;
    }

    // 🚫 Prevent double call
    const existingCall = await Call.findOne({
      $or: [
        { caller: from, status: { $in: ["ringing", "ongoing"] } },
        { receiver: from, status: { $in: ["ringing", "ongoing"] } },
      ],
    });

    if (existingCall) {
      socket.emit("already_in_call");
      return;
    }

    const call = await Call.create({
      conversation: conversation_id,
      caller: from,
      receiver: to,
      type: "audio",
      status: "ringing",
      startedAt: new Date(),
    });

    const roomID = `call_${call._id}`;

    if (receiver.socket_id) {
      io.to(receiver.socket_id).emit("incoming_audio_call", {
        from,
        roomID,
        call_id: call._id,
      });
    }

    // ⏳ Auto-expire after 30s
    const timeout = setTimeout(async () => {
      const callDoc = await Call.findById(call._id);
      if (callDoc && callDoc.status === "ringing") {
        callDoc.status = "missed";
        callDoc.endedAt = new Date();
        await callDoc.save();

        const caller = await User.findById(callDoc.caller);

        if (caller?.socket_id) {
          io.to(caller.socket_id).emit("audio_call_missed");
        }

        callTimeouts.delete(call._id.toString());
      }
    }, 30000);

    callTimeouts.set(call._id.toString(), timeout);
  });

  socket.on("audio_call_accept", async ({ call_id }) => {
    const call = await Call.findById(call_id);
    if (!call || call.status !== "ringing") return;

    if (call.receiver.toString() !== socket.user_id.toString()) return;

    // 🔥 Set to ongoing
    call.status = "ongoing";
    await call.save();

    const timeout = callTimeouts.get(call_id);
    if (timeout) {
      clearTimeout(timeout);
      callTimeouts.delete(call_id);
    }

    const caller = await User.findById(call.caller);

    if (caller?.socket_id) {
      io.to(caller.socket_id).emit("audio_call_accepted", {
        roomID: `call_${call_id}`,
      });
    }
  });

  socket.on("audio_call_reject", async ({ call_id }) => {
    const call = await Call.findById(call_id);
    if (!call || call.status !== "ringing") return;

    // Only receiver can reject
    if (call.receiver.toString() !== socket.user_id.toString()) return;

    call.status = "rejected";
    call.endedAt = new Date();
    await call.save();

    const timeout = callTimeouts.get(call_id);
    if (timeout) {
      clearTimeout(timeout);
      callTimeouts.delete(call_id);
    }

    const caller = await User.findById(call.caller);

    if (caller?.socket_id) {
      io.to(caller.socket_id).emit("audio_call_rejected");
    }
  });

  socket.on("audio_call_end", async ({ call_id }) => {
    const call = await Call.findById(call_id);
    if (!call) return;

    if (
      call.caller.toString() !== socket.user_id &&
      call.receiver.toString() !== socket.user_id
    ) {
      return;
    }

    if (["completed", "missed", "rejected"].includes(call.status)) return;

    const endedAt = new Date();

    call.endedAt = endedAt;
    if (call.status === "ongoing") {
      call.duration = Math.floor((endedAt - call.startedAt) / 1000);
    } else {
      call.duration = 0;
    }
    call.status = "completed";

    await call.save();

    await OneToOneMessage.findByIdAndUpdate(call.conversation, {
      $push: {
        messages: {
          _id: new mongoose.Types.ObjectId(),
          from: call.caller,
          to: call.receiver,
          type: "Call",
          text: `Audio call (${call.duration}s)`,
          createdAt: new Date(),
          status: "read",
        },
      },
    });

    const timeout = callTimeouts.get(call_id);
    if (timeout) {
      clearTimeout(timeout);
      callTimeouts.delete(call_id);
    }

    // 🔥 Determine other user from DB, NOT frontend
    const otherUserId =
      call.caller.toString() === socket.user_id ? call.receiver : call.caller;

    const otherUser = await User.findById(otherUserId);

    if (otherUser?.socket_id) {
      io.to(otherUser.socket_id).emit("audio_call_ended");
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

    const ongoingCalls = await Call.find({
      $or: [{ caller: socket.user_id }, { receiver: socket.user_id }],
      status: { $in: ["ringing", "ongoing"] },
    });

    for (const call of ongoingCalls) {
      if (call.status === "ringing") {
        call.status = "missed";
      } else {
        call.status = "completed";
      }
      call.endedAt = new Date();
      call.duration = Math.floor((call.endedAt - call.startedAt) / 1000);
      await call.save();
      await OneToOneMessage.findByIdAndUpdate(call.conversation, {
        $push: {
          messages: {
            _id: new mongoose.Types.ObjectId(),
            from: call.caller,
            to: call.receiver,
            type: "Call",
            text: `Audio call (${call.duration}s)`,
            createdAt: new Date(),
            status: "read",
          },
        },
      });
      const timeout = callTimeouts.get(call._id.toString());
      if (timeout) {
        clearTimeout(timeout);
        callTimeouts.delete(call._id.toString());
      }
    }

    for (const call of ongoingCalls) {
      const otherUserId =
        call.caller.toString() === socket.user_id ? call.receiver : call.caller;

      const otherSocket = await getSocketIdByUserId(otherUserId);

      if (otherSocket) {
        io.to(otherSocket).emit("audio_call_ended");
      }
    }

    console.log("User disconnected:", socket.user_id);
  });
});
