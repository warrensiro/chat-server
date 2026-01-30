const FriendRequest = require("../models/friendRequest");
const User = require("../models/user");

exports.updateMe = async (req, res, next) => {
  // update user details except password

  const { user } = req;

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "about",
    "avatar"
  );

  // accessing our model
  const updated_user = await User.findByIdAndUpdate(user._id, filteredBody, {
    new: true,
    validateModifiedOnly: true,
  });

  res.status(200).json({
    status: "success",
    data: updated_user,
    message: "User updated successfully",
  });
};

exports.getUsers = async (req, res, next) => {
  const this_user = req.user;

  // get all friend requests involving this user
  const requests = await FriendRequest.find({
    $or: [
      { sender: this_user._id },
      { recipient: this_user._id },
    ],
  });

  // collect all userIds involved in requests
  const requestedUserIds = requests.map((req) =>
    req.sender.toString() === this_user._id.toString()
      ? req.recipient.toString()
      : req.sender.toString()
  );

  const users = await User.find({
    verified: true,
    _id: {
      $ne: this_user._id,
      $nin: [...this_user.friends, ...requestedUserIds],
    },
  }).select("_id firstName lastName status avatar");

  res.status(200).json({
    status: "success",
    data: users,
    message: "Users found successfully",
  });
};


exports.getFriendRequests = async (req, res, next) => {
  const requests = await FriendRequest.find({
    recipient: req.user._id,
  }).populate("sender", "_id firstName lastName");

  res.status(200).json({
    status: "success",
    data: requests,
    message: "Friend requests fetched successfully",
  });
  console.log("Friend requests:", requests);
};

exports.getFriends = async (req, res, next) => {
  const this_user = await User.findById(req.user._id).populate(
    "friends",
    "_id firstName lastName"
  );

  res.status(200).json({
    status: "success",
    data: this_user.friends,
    message: "Friends fetched successfully",
  });
};
