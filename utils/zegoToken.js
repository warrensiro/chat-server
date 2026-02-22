const crypto = require("crypto");

function generateToken04(appID, userID, serverSecret, effectiveTimeInSeconds, payload = "") {
  if (!appID || !userID || !serverSecret) {
    throw new Error("Missing required parameters");
  }

  const createTime = Math.floor(Date.now() / 1000);
  const expireTime = createTime + effectiveTimeInSeconds;

  const nonce = Math.floor(Math.random() * 2147483647);
  const version = "04";

  const tokenInfo = {
    app_id: appID,
    user_id: userID,
    nonce: nonce,
    ctime: createTime,
    expire: expireTime,
    payload: payload,
  };

  const tokenInfoStr = JSON.stringify(tokenInfo);
  const hmac = crypto.createHmac("sha256", serverSecret);
  hmac.update(tokenInfoStr);
  const signature = hmac.digest("hex");

  const token = Buffer.from(
    JSON.stringify({
      ...tokenInfo,
      signature,
      version,
    })
  ).toString("base64");

  return token;
}

module.exports = { generateToken04 };