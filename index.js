const express = require("express");
const axios = require("axios");
const cloud = require("wx-server-sdk");

cloud.init({
  env: process.env.CLOUD_ENV,
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY,
});

const db = cloud.database();
const app = express();
app.use(express.json());

// 全局异常捕获，防止 Node 崩溃
process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的Promise 异常:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("未捕获异常:", err);
});

// 获取公众号 access_token
async function getAccessToken(appid, secret) {
  try {
    // 方法一：尝试使用微信云SDK获取token
    try {
      const { token } = await cloud.openapi.authorizer.getAccessToken();
      if (token) return token;
    } catch (cloudError) {
      console.log("云SDK获取token失败，尝试使用API方式：", cloudError);
    }

    // 方法二：使用API方式获取
    const https = require("https");
    const res = await axios.get(`https://api.weixin.qq.com/cgi-bin/token`, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      params: {
        grant_type: "client_credential",
        appid,
        secret,
      },
    });
    return res.data.access_token;
  } catch (error) {
    console.error("获取 access_token 出错:", error);
    return null;
  }
}

// 获取用户的 OpenId 信息
async function getUserInfo(access_token, openid) {
  try {
    // 方法一：尝试使用微信云SDK获取用户信息
    try {
      const result = await cloud.openapi.wxaapi.getUserInfo({
        openid,
      });
      if (result) return result;
    } catch (cloudError) {
      console.log("云SDK获取用户信息失败，尝试使用API方式：", cloudError);
    }

    // 方法二：使用API方式获取
    const https = require("https");
    const res = await axios.get(`https://api.weixin.qq.com/cgi-bin/user/info`, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      params: {
        access_token,
        openid,
        lang: "zh_CN",
      },
    });
    return res.data;
  } catch (error) {
    console.error("获取用户信息失败:", error);
    return null;
  }
}

// 监听微信事件推送
app.post("/", async (req, res) => {
  const { Event, FromUserName } = req.body;

  if (Event === "unsubscribe" || Event === "subscribe") {
    const APPID = process.env.APPID;
    const APPSECRET = process.env.APPSECRET;

    const access_token = await getAccessToken(APPID, APPSECRET);
    if (!access_token) return res.send("failed");

    const userInfo = await getUserInfo(access_token, FromUserName);
    if (!userInfo || !userInfo.unionid) return res.send("failed");

    const user = await db
      .collection("users")
      .where({
        unionid: userInfo.unionid,
      })
      .get();

    console.log("查询用户:", user);

    if (user.data.length > 0) {
      await db
        .collection("users")
        .doc(user.data[0]._id)
        .update({
          data: {
            gzhOpenId: Event === "subscribe" ? userInfo.openid : null,
          },
        });
    }
  }

  res.send("success");
});

app.listen(80, () => {
  console.log("服务启动成功！监听 80 端口");
});
