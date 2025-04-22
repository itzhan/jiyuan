const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cloud = require("wx-server-sdk");
const xml2js = require("xml2js");
const { init: initDB, Counter } = require("./db");

const WX_CLOUD_ENV = "cloud1-9g0ddevqa589d711";
// 初始化云开发
cloud.init({
  env: WX_CLOUD_ENV,
});

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.text({ type: "text/xml" }));
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 添加健康检查路由
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// 微信消息推送接口
app.post("/", async (req, res) => {
  console.log("收到消息推送", req.headers["content-type"], req.body);

  // 处理JSON格式的消息
  if (
    req.headers["content-type"] &&
    req.headers["content-type"].includes("application/json")
  ) {
    // 消息推送配置检测
    if (req.body && req.body.action === "CheckContainerPath") {
      console.log("收到路径检测请求 (JSON)");
      return res.send("success");
    }

    try {
      // 正常的消息处理逻辑
      console.log("处理JSON消息", req.body);
      // 这里可以添加您的消息处理逻辑

      res.send("success");
    } catch (error) {
      console.error("处理JSON消息出错:", error);
      res.send("success"); // 即使出错也返回success，避免微信服务器重试
    }
  }
  // 处理XML格式的消息
  else if (
    req.headers["content-type"] &&
    req.headers["content-type"].includes("text/xml")
  ) {
    try {
      // 解析XML消息
      const result = await new Promise((resolve, reject) => {
        xml2js.parseString(req.body, { trim: true }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      console.log("解析的XML消息:", result);

      // 检查是否是路径检测请求
      if (
        result.xml &&
        result.xml.action &&
        result.xml.action[0] === "CheckContainerPath"
      ) {
        console.log("收到路径检测请求 (XML)");
        return res.send("success");
      }

      // 处理正常的XML消息
      console.log("处理XML消息", result);
      // 这里可以添加您的XML消息处理逻辑

      res.send("success");
    } catch (error) {
      console.error("处理XML消息出错:", error);
      res.send("success"); // 即使出错也返回success
    }
  }
  // 其他格式的请求
  else {
    console.log("收到未知格式的请求");
    res.send("success");
  }
});

// 更新计数
app.post("/api/count", async (req, res) => {
  try {
    const { action } = req.body;
    if (action === "inc") {
      await Counter.create();
    } else if (action === "clear") {
      await Counter.destroy({
        truncate: true,
      });
    }
    res.send({
      code: 0,
      data: await Counter.count(),
    });
  } catch (error) {
    console.error("更新计数出错：", error);
    res.status(500).send({
      code: 500,
      message: "更新计数出错",
    });
  }
});

// 获取计数
app.get("/api/count", async (req, res) => {
  try {
    const result = await Counter.count();
    res.send({
      code: 0,
      data: result,
    });
  } catch (error) {
    console.error("获取计数出错：", error);
    res.status(500).send({
      code: 500,
      message: "获取计数出错",
    });
  }
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// 处理微信公众号事件推送
app.post("/wx/event", express.text(), async (req, res) => {
  try {
    // 解析XML消息
    const result = await new Promise((resolve, reject) => {
      xml2js.parseString(req.body, { trim: true }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const message = result.xml;
    const event = message.Event?.[0];
    const fromUserName = message.FromUserName?.[0];

    if (event === "subscribe" || event === "unsubscribe") {
      try {
        // 获取用户信息
        const wxContext = cloud.getWXContext();
        const db = cloud.database();

        // 根据unionId查找用户
        const user = await db
          .collection("users")
          .where({
            unionId: wxContext.UNIONID,
          })
          .get();

        if (user.data.length > 0) {
          // 更新用户的公众号openId
          await db
            .collection("users")
            .doc(user.data[0]._id)
            .update({
              data: {
                officialAccountOpenId:
                  event === "subscribe" ? fromUserName : null,
              },
            });
        }
      } catch (cloudError) {
        console.error("操作云数据库出错：", cloudError);
        // 不影响主流程，静默处理错误
      }
    }

    res.send("success");
  } catch (error) {
    console.error("处理公众号事件出错：", error);
    res.status(500).send("error");
  }
});

const port = process.env.PORT || 80;

async function bootstrap() {
  let retries = 5;

  while (retries) {
    try {
      console.log("尝试初始化数据库...");
      await initDB();
      console.log("数据库初始化成功");
      break;
    } catch (err) {
      console.error("数据库初始化失败:", err);
      retries -= 1;

      if (retries === 0) {
        console.error("数据库初始化失败，继续启动服务以提供基本功能");
        break; // 即使数据库初始化失败，也继续启动服务
      }

      // 等待5秒后重试
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  app.listen(port, () => {
    console.log("服务启动成功，监听端口:", port);
  });
}

bootstrap();
