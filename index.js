const express = require("express");
const axios = require("axios");
const tcb = require("@cloudbase/node-sdk");

const cloud = tcb.init({
  env: process.env.CLOUD_ENV,
  // 添加腾讯云认证信息
  secretId: process.env.TENCENTCLOUD_SECRET_ID,
  secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
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

// 获取公众号用户信息
async function getUserInfo(openid) {
  console.log(`开始获取用户信息，openid: ${openid}`);
  try {
    const url = `http://api.weixin.qq.com/cgi-bin/user/info`;

    const res = await axios.get(url, {
      params: {
        openid,
        lang: "zh_CN",
        from_appid: process.env.APPID, // 公众号的 appid
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

  // 关注或取关事件处理
  if (Event === "subscribe" || Event === "unsubscribe") {
    console.log(`处理${Event}事件，用户OpenID: ${FromUserName}`);

    try {
      // 获取用户信息
      const userInfo = await getUserInfo(FromUserName);
      console.log("获取到的用户信息:", userInfo);

      if (Event === "subscribe") {
        // 关注事件处理
        if (userInfo && userInfo.unionid) {
          console.log(`关注事件: 获取到unionid: ${userInfo.unionid}`);

          // 查询用户是否存在
          const userQueryResult = await db
            .collection("gzhOpenId")
            .where({ unionid: userInfo.unionid })
            .get();

          console.log("查询用户结果:", JSON.stringify(userQueryResult));

          if (userQueryResult.data && userQueryResult.data.length > 0) {
            // 用户存在，更新gzhOpenId和isActive
            const userData = userQueryResult.data[0];
            console.log(
              `找到用户记录，ID: ${userData._id}，更新gzhOpenId和isActive`
            );

            const updateResult = await db
              .collection("gzhOpenId")
              .doc(userData._id)
              .update({
                  gzhOpenId: FromUserName,
                  isActive: true,
                  updatedAt: db.serverDate(),
              });

            console.log("更新用户结果:", JSON.stringify(updateResult));
          } else {
            // 用户不存在，可以选择创建新用户或其他处理方式
            console.log("没有找到匹配的用户记录，可能需要创建新用户");

            const createResult = await db.collection("gzhOpenId").add({
                unionId: userInfo.unionid,
                gzhOpenId: FromUserName,
                isActive: true,
            });
            console.log("创建新用户结果:", JSON.stringify(createResult));
          }
        } else {
          console.log("关注事件: 未获取到unionid");
        }
      } else if (Event === "unsubscribe") {
        // 取关事件处理
        console.log(`取关事件: 处理用户OpenID: ${FromUserName}`);

        // 由于取关时可能无法获取unionid，直接通过gzhOpenId查找用户
        const userQueryResult = await db
          .collection("gzhOpenId")
          .where({ gzhOpenId: FromUserName })
          .get();

        console.log(
          "根据gzhOpenId查询用户结果:",
          JSON.stringify(userQueryResult)
        );

        if (userQueryResult.data && userQueryResult.data.length > 0) {
          // 找到用户，更新isActive为false
          const userData = userQueryResult.data[0];
          console.log(`找到用户记录，ID: ${userData._id}，设置isActive为false`);

          const updateResult = await db
            .collection("gzhOpenId")
            .doc(userData._id)
            .update({
                isActive: false,
            });

          console.log("更新用户状态结果:", JSON.stringify(updateResult));
        } else {
          console.log("没有找到匹配的用户记录，无法更新状态");
        }
      }
    } catch (error) {
      console.error("处理事件出错:", error);
    }
  } else {
    console.log(`收到非关注/取关事件: ${Event}，不处理`);
  }

  console.log("处理完成，返回success");
  res.send("success");
});


// 发送模版消息
app.post("/sendTemplateMessage", async (req, res) => {
  console.log("收到POST请求，请求体:", JSON.stringify(req.body));
  const { openid, templateId, templateData } = req.body;

  // 发送模版消息
  try {
    const url = 'http://api.weixin.qq.com/cgi-bin/message/template/send'
    const result = await axios.post(url, {
      touser: openid,
      template_id: templateId,
      data: templateData,
    });

    console.log("发送模版消息成功:", result.data);
    // 告诉调用者发送成功
    res.status(200).send(result.data); 
  }
  catch (error) {
    console.error("发送模版消息失败，详细信息:", error.message);
  }
})

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
