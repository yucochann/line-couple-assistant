const express = require("express");
require("dotenv").config();

const app = express();
const PORT = 3000;

// 讓 express 可以解析 json
app.use(express.json());

// 測試首頁
app.get("/", (req, res) => {
  res.send("LINE bot server is running");
});

app.post("/webhook", (req, res) => {
  console.log("========== 收到 webhook ==========");

  const events = req.body.events;

  if (!events || events.length === 0) {
    console.log("沒有events");
    console.log("========== 結束 ==========");
    return res.status(200).send("OK");
  }

  events.forEach((event) => {
    if (event.type === "message" && event.message.type === "text") {
      console.log("收到文字訊息:", event.message.text);
    } else {
      console.log("不是文字訊息，略過");
    }
  });

  console.log("========== 結束 ==========");

  res.status(200).send("OK");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
