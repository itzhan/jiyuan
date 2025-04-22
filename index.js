const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cloud = require("wx-server-sdk");
const xml2js = require("xml2js");
const { init: initDB, Counter } = require("./db");


const WX_CLOUD_ENV = "cloud1-9g0ddevqa589d711"
// 初始化云开发
cloud.init({
  env: WX_CLOUD_ENV,
});

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 更新计数
app.post("/api/count", async (req, res) => {
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
});

// 获取计数
app.get("/api/count", async (req, res) => {
  const result = await Counter.count();
  res.send({
    code: 0,
    data: result,
  });
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
    }

    res.send("success");
  } catch (error) {
    console.error("处理公众号事件出错：", error);
    res.status(500).send("error");
  }
});

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
