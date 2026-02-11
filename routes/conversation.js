const router = require("express").Router();
const conversationController = require("../controllers/conversation");
const authController = require("../controllers/auth");

router.get(
  "/get-conversations",
  authController.protect,
  conversationController.getConversations
);

module.exports = router;