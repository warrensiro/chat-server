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
  const all_users = await User.find({
    verified: true,
  }).select("firstName lastName _id");

  const this_user = req.user;

  const remaining_users = all_users.filter(
    (user) =>
      !this_user.friends.includes(user._id) &&
      user._id.toString() !== req.user._id.toString()
  );

  res.status(200).json({
    status: "success",
    data: remaining_users,
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
};

exports.getFriends = async (req, res, next) => {
  const friends = await User.findById(req.user._id).populate(
    "friends",
    "_id firstName lastName"
  );

  res.status(200).json({
    status: "success",
    data: friends,
    message: "Friends fetched successfully",
  });
};
