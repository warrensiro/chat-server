const jwt = require("jsonwebtoken");

// get our model here for crud operations
const User = require("../models/user");

const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET);
};

// register controller/endpoint
exports.register = async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body
  
}

// login controller
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });
  }

  const userDoc = await User.findOne({ email: email }).select("+password");

  if (
    !userDoc ||
    !(await userDoc.correctPassword(password, userDoc.password))
  ) {
    res.status(400).json({
      status: 400,
      message: "Email or password is incorrect",
    });
  }

  const token = signToken(userDoc._id);

  res.status(200).json({
    status: "success",
    message: "Login successful",
    token,
  });
};
