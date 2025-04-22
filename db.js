const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

// 检查环境变量是否设置
if (!MYSQL_USERNAME || !MYSQL_PASSWORD || !MYSQL_ADDRESS) {
  console.warn("数据库配置环境变量不完整，可能导致数据库连接失败");
  console.warn(
    "请确保设置了 MYSQL_USERNAME, MYSQL_PASSWORD 和 MYSQL_ADDRESS 环境变量"
  );
}

const [host, port] = MYSQL_ADDRESS.split(":");

// 打印数据库连接信息（不包含密码）
console.log(`准备连接到数据库: ${host}:${port}, 用户名: ${MYSQL_USERNAME}`);

// 配置Sequelize连接
const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql",
  // 连接池配置
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  // 日志输出
  logging: console.log,
});

// 定义数据模型
const Counter = sequelize.define("Counter", {
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
});

// 数据库初始化方法
async function init() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    console.log("数据库连接成功.");

    // 同步模型到数据库
    await Counter.sync({ alter: true });
    console.log("数据模型同步成功.");

    return true;
  } catch (error) {
    console.error("无法连接到数据库:", error.message);
    // 抛出错误以便调用方处理
    throw error;
  }
}

// 导出初始化方法和模型
module.exports = {
  init,
  Counter,
  sequelize,
};
