const express = require('express')
const fetch = require('node-fetch');
const tcb = require('tcb-admin-node');

tcb.init({
  env: process.env.CLOUD_ENV,
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY
})

const db = tcb.database()
const app = express()
app.use(express.json())

// 获取公众号 access_token
async function getAccessToken(appid, secret) {
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/stable_token?grant_type=client_credential&appid=${appid}&secret=${secret}`);
  const json = await res.json();
  return json.access_token;
}
// 获取用户的OpenId信息
async function getUserInfo(access_token, openid) {
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/user/info?access_token=${access_token}&openid=${openid}&lang=zh_CN`);
  const json = await res.json();
  return json;
}


// 监听微信事件推送
app.post('/', async (req, res) => {
  const { Event, FromUserName} = req.body

  if (Event === 'unsubscribe' || Event === 'subscribe') {
    const APPID = process.env.APPID
    const APPSECRET = process.env.APPSECRET
    const access_token = await getAccessToken(APPID, APPSECRET)
    const userInfo = await getUserInfo(access_token, FromUserName)
    
    const user = await db.collection('users').where({
      unionid: userInfo.unionid
    }).get()
    console.log('user', user)

    if (user.data.length > 0) {
      await db
      .collection("users")
      .doc(user.data[0]._id)
      .update({
        data: {
          gzhOpenId:
            Event === "subscribe" ? userInfo.openid : null,
        },
      });
    }
  }

  res.send('success') 
});

app.listen(80, function(){
  console.log('服务启动成功！')
})