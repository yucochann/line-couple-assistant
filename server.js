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

// 處理接收到的指令
app.post("/webhook", (req, res) => {
  console.log("========== 收到 webhook ==========");
  const events = req.body.events;

  if (!events || events.length === 0) {
    console.log("沒有events");
    console.log("========== 結束 ==========");
    return res.status(200).send("OK");
  }

  events.forEach((event) => {
    const text = event.message.text;
    const lines = text.split("\n");
    const command = lines[0].trim();

    if (command === "記帳") {
      handleExpense(lines);
    }
  });

  console.log("========== 結束 ==========");
  res.status(200).send("OK");
});

// 處理記帳
function handleExpense(lines) {
  lines.forEach((line, index) => {
    const cleanLine = line.trim();

    if (index === 0 || !cleanLine) return;
    const match = cleanLine.match(/^(.+?)(?::|\s+)?(\d+)$/);

    if (match) {
      const item = match[1].trim();
      const amount = Number(match[2]);

      console.log("記帳項目");
      console.log("項目：", item);
      console.log("金額：", amount);
    } else {
      console.log("無法解析:", cleanLine);
    }
  });
}

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
