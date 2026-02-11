const OneToOneMessage = require("../models/OneToOneMessage");

exports.getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    const conversations = await OneToOneMessage.find({
      participants: userId,
    })
      .populate("participants", "firstName lastName _id email status")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      status: "success",
      data: conversations,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch conversations",
    });
  }
};