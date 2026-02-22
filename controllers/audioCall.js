const { generateToken04 } = require("../utils/zegoToken");

exports.generateZegoToken = async (req, res) => {
  try {
    const { userID, roomID } = req.body;

    if (!userID || !roomID) {
      return res.status(400).json({
        message: "userID and roomID are required",
      });
    }

    const appID = Number(process.env.ZEGO_APP_ID);
    const serverSecret = process.env.ZEGO_SERVER_SECRET;

    const effectiveTimeInSeconds = 3600; // 1 hour

    const payload = JSON.stringify({
      room_id: roomID,
    });

    const token = generateToken04(
      appID,
      userID,
      serverSecret,
      effectiveTimeInSeconds,
      payload,
    );

    res.status(200).json({
      status: "success",
      token,
      appID,
    });
  } catch (error) {
    console.error("Zego token error:", error);
    res.status(500).json({
      message: "Token generation failed",
    });
  }
};
