const express = require('express')
const cloud = require("wx-server-sdk");

cloud.init({
  env: 'cloud1-9g0ddevqa589d711'
})

const app = express()
app.use(express.json())

app.post('/', async (req, res) => {
  if (req.body.type === 'unsubscribe' || req.body.type === 'subscribe') {
    const wxContext = cloud.getWXContext()
    console.log('wxContext', wxContext)

    const db = cloud.database()
    const user = await db.collection('users').where({
      openid: wxContext.OPENID
    }).get()
    console.log('user', user)

    if (user.data.length > 0) {
      await db
      .collection("users")
      .doc(user.data[0]._id)
      .update({
        data: {
          gzhOpenId:
            req.body.type === "subscribe" ? req.body.FromUserName : null,
        },
      });
    }
  }

  res.send('success') // 不进行任何回复，直接返回success，告知微信服务器已经正常收到。
});

app.listen(80, function(){
  console.log('服务启动成功！')
})