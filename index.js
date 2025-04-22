const express = require("express");
const axios = require("axios");
const tcb = require("@cloudbase/node-sdk");

console.log("程序启动，加载模块完成");
console.log("环境变量CLOUD_ENV:", process.env.CLOUD_ENV);

const cloud = tcb.init({
  env: process.env.CLOUD_ENV,
  // 添加腾讯云认证信息
  secretId: process.env.TENCENTCLOUD_SECRETID,
  secretKey: process.env.TENCENTCLOUD_SECRETKEY
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

// 获取公众号用户信息
async function getUserInfo(openid) {
  console.log(`开始获取用户信息，openid: ${openid}`);
  try {
    const url = `http://api.weixin.qq.com/cgi-bin/user/info`;
    console.log(`请求URL: ${url}`);

    const res = await axios.get(url, {
      params: {
        openid,
        lang: "zh_CN",
        from_appid: process.env.APPID  // 公众号的 appid
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

// 修改主路由处理
app.post("/", async (req, res) => {
  console.log("收到POST请求，请求体:", JSON.stringify(req.body));
  const { Event, FromUserName } = req.body;
  console.log(`事件类型: ${Event}, 来源用户: ${FromUserName}`);

  if (Event === "unsubscribe" || Event === "subscribe") {
    console.log(`处理${Event}事件`);
    
    // 直接获取用户信息，不需要先获取 access_token
    const userInfo = await getUserInfo(FromUserName);
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
