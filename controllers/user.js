const User = require("../models/user")


exports.updateMe = async(req, res, next) => {
    // update user details except password

    const {user} = req;

    const filteredBody = filterObj(req.body, "firstName", "lastName", "about", "avatar");

    // accessing our model
    const updated_user = await User.findByIdAndUpdate(user._id, filteredBody, {
        new: true,
        validateModifiedOnly: true
    });
}