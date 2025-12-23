const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const crypto = require("crypto");

// get our model here for crud operations
const User = require("../models/user");

const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET);
};

// register controller/endpoint
exports.register = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "password",
    "email"
  );

  // check if user is already in the db
  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    res.status(400).json({
      status: "error",
      message: "User with that email already exists",
    });
  } else if (existing_user) {
    // update the existing unverified user
    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    }); // this is to update existing user

    // generate otp and send email
    req.userId = existing_user._id;
    next();
  } else {
    // create new user
    const new_user = await User.create(filteredBody);

    // generate otp and send email
    req.userId = new_user._id;
    next();
  }
};

// send OTP controller
exports.sendOTP = async (req, res, next) => {
  const { userId } = req;
  const new_otp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // 10 minutes from now

  await User.findByIdAndUpdate(userId, {
    otp: new_otp,
    otp_expiry_time,
  });

  // send mail here with the otp
  res.status(200).json({
    status: "success",
    message: "OTP sent successfully",
  });
};

// verify OTP controller
exports.verifyOTP = async (req, res, next) => {
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP has expired",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  // OTP is correct,mark user as verified
  user.verified = true;
  user.otp = undefined;
  user.otp_expiry_time = undefined;
  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "User verified successfully",
    token,
  });
};

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

// protect middleware
exports.protect = async (req, res, next) => {};

// forgot password controller
exports.forgotPassword = async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "No user with this email",
    });
  }

  // generate random reset token
  const resetToken = user.createPasswordResetToken();

  const resetURL = `https://siro.com/auth/reset-password/?code=${resetToken}`;
  try {
    // send mail here
    res.status(200).json({
      status: "success",
      message: "Reset password link sent to mail",
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email. Try again later.",
    });
  }
};

// reset password controller
exports.resetPassword = async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // if token has not expired, and there is user, set the new password
  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Token is invalid or has expired",
    });
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // login user and send new jwt

  // an email to inform of password change

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Password reset successfully",
    token,
  });
};
