const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  sender: {
    // store reference
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  recipient: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
});

const FriendRequest = new mongoose.model("FriendRequest", requestSchema);
module.exports = FriendRequest;
