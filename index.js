const express = require("express");
const axios = require("axios");
const tcb = require("@cloudbase/node-sdk");
const https = require("https");

console.log("程序启动，加载模块完成");
console.log("环境变量CLOUD_ENV:", process.env.CLOUD_ENV);

const cloud = tcb.init({
  env: process.env.CLOUD_ENV,
});
console.log("云环境初始化完成");

const db = cloud.database();
console.log("数据库连接初始化完成");

const app = express();
app.use(express.json());
console.log("Express应用初始化完成");

// 全局异常捕获，防止 Node 崩溃
process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的Promise 异常:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("未捕获异常:", err);
});
console.log("全局异常处理已设置");

// 获取公众号 access_token
async function getAccessToken(appid, secret) {
  console.log(
    `开始获取access_token，appid: ${appid}, secret: ${
      secret ? "已提供" : "未提供"
    }`
  );
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token`;
    console.log(`请求URL: ${url}`);

    const res = await axios.get(url, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      params: {
        grant_type: "client_credential",
        appid,
        secret,
      },
    });
    console.log("获取access_token成功:", res.data);
    return res.data.access_token;
  } catch (error) {
    console.error("获取access_token出错，详细信息:", error.message);
    if (error.response) {
      console.error("响应状态:", error.response.status);
      console.error("响应数据:", error.response.data);
    }
    return null;
  }
}

// 获取用户的 OpenId 信息
async function getUserInfo(access_token, openid) {
  console.log(
    `开始获取用户信息，access_token: ${
      access_token ? "已提供" : "未提供"
    }, openid: ${openid}`
  );
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/user/info`;
    console.log(`请求URL: ${url}`);

    const res = await axios.get(url, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      params: {
        access_token,
        openid,
        lang: "zh_CN",
      },
    });
    console.log("获取用户信息成功:", res.data);
    return res.data;
  } catch (error) {
    console.error("获取用户信息失败，详细信息:", error.message);
    if (error.response) {
      console.error("响应状态:", error.response.status);
      console.error("响应数据:", error.response.data);
    }
    return null;
  }
}

// 监听微信事件推送
app.post("/", async (req, res) => {
  console.log("收到POST请求，请求体:", JSON.stringify(req.body));
  const { Event, FromUserName } = req.body;
  console.log(`事件类型: ${Event}, 来源用户: ${FromUserName}`);

  if (Event === "unsubscribe" || Event === "subscribe") {
    console.log(`处理${Event}事件`);
    const APPID = process.env.APPID;
    const APPSECRET = process.env.APPSECRET;
    console.log(
      `环境变量APPID: ${APPID}, APPSECRET: ${APPSECRET ? "已提供" : "未提供"}`
    );

    const access_token = await getAccessToken(APPID, APPSECRET);
    if (!access_token) {
      console.log("获取access_token失败，返回failed");
      return res.send("failed");
    }

    console.log(`成功获取access_token: ${access_token}`);
    const userInfo = await getUserInfo(access_token, FromUserName);
    if (!userInfo || !userInfo.unionid) {
      console.log("获取用户信息失败或无unionid，返回failed");
      return res.send("failed");
    }

    console.log(`成功获取用户信息: ${JSON.stringify(userInfo)}`);
    console.log(`开始查询数据库中的用户，unionid: ${userInfo.unionid}`);

    try {
      const user = await db
        .collection("users")
        .where({
          unionid: userInfo.unionid,
        })
        .get();

      console.log("查询用户结果:", JSON.stringify(user));

      if (user.data && user.data.length > 0) {
        console.log(`找到用户，ID: ${user.data[0]._id}，开始更新gzhOpenId`);
        const updateResult = await db
          .collection("users")
          .doc(user.data[0]._id)
          .update({
            data: {
              gzhOpenId: Event === "subscribe" ? userInfo.openid : null,
            },
          });
        console.log("更新用户结果:", JSON.stringify(updateResult));
      } else {
        console.log("未找到匹配的用户记录");
      }
    } catch (dbError) {
      console.error("数据库操作失败:", dbError);
    }
  } else {
    console.log(`跳过非关注/取关事件: ${Event}`);
  }

  console.log("处理完成，返回success");
  res.send("success");
});

// 添加一个健康检查端点
app.get("/health", (req, res) => {
  console.log("收到健康检查请求");
  res.status(200).send("服务运行正常");
});

app.listen(80, () => {
  console.log("服务启动成功！监听 80 端口");
  console.log("环境变量:", {
    CLOUD_ENV: process.env.CLOUD_ENV,
    APPID: process.env.APPID,
    APPSECRET: process.env.APPSECRET ? "已设置" : "未设置",
  });
});
