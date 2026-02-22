const express = require("express");
const router = express.Router();
const callController = require("../controllers/call");
const zegoController = require("../controllers/audioCall");
const { protect } = require("../controllers/auth"); // your auth middleware

router.post("/token", protect, zegoController.generateZegoToken);
router.get("/", protect, callController.getCallHistory);
router.post("/start", protect, callController.startCall);
router.patch("/:callId/accept", protect, callController.acceptCall);
router.patch("/:callId/end", protect, callController.endCall);
router.patch("/:callId/reject", protect, callController.rejectCall);

module.exports = router;