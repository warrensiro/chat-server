// contains multiple routes
const router = require("express").Router()
const authRoute = require("./auth")
const userRoute = require("./user")
const conversationRoute = require("./conversation")

router.use("/conversation", conversationRoute)
router.use("/call", require("./call"))
// router.use("/history", require("./history"))
router.use("/auth", authRoute)
router.use("/user", userRoute)

module.exports = router