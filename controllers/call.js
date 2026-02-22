const Call = require("../models/call");

exports.getCallHistory = async (req, res) => {
  const calls = await Call.find({
    $or: [
      { caller: req.user._id },
      { receiver: req.user._id },
    ],
  })
    .populate("caller", "firstName lastName avatar")
    .populate("receiver", "firstName lastName avatar")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    data: calls,
  });
};

exports.startCall = async (req, res) => {
  try {
    const { receiverId, type } = req.body;

    const newCall = await Call.create({
      caller: req.user._id,
      receiver: receiverId,
      type: type || "audio",
      status: "ringing",
      startedAt: new Date(),
    });

    res.status(201).json({
      status: "success",
      data: newCall,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

exports.acceptCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await Call.findByIdAndUpdate(
      callId,
      {
        status: "ongoing",
        startedAt: new Date(),
      },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

exports.endCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await Call.findById(callId);

    if (!call) {
      return res.status(404).json({
        status: "error",
        message: "Call not found",
      });
    }

    call.endedAt = new Date();
    call.status = "completed";

    if (call.startedAt) {
      call.duration = Math.floor(
        (call.endedAt - call.startedAt) / 1000
      );
    }

    await call.save();

    res.status(200).json({
      status: "success",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

exports.rejectCall = async (req, res) => {
  try {
    const { callId } = req.params;

    const call = await Call.findByIdAndUpdate(
      callId,
      {
        status: "rejected",
        endedAt: new Date(),
      },
      { new: true }
    );

    res.status(200).json({
      status: "success",
      data: call,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};