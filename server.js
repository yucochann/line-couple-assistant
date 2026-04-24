const express = require("express");
require("dotenv").config();
const { Client } = require("@notionhq/client");
const axios = require("axios");

const app = express();
const PORT = 3000;

// 暫存使用者尚未確認的記帳資料
const tempStore = {};

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

// 讓 express 可以解析 json
app.use(express.json());

// 測試首頁
app.get("/", (req, res) => {
  res.send("LINE bot server is running");
});

// Webhook 入口 處理接收到的指令
app.post("/webhook", async (req, res) => {
  console.log("========== 收到 webhook ==========");
  const events = req.body.events;

  if (!events || events.length === 0) {
    console.log("沒有events");
    console.log("========== 結束 ==========");
    return res.status(200).send("OK");
  }

  for (const event of events) {
    if (event.type === "postback") {
      const data = event.postback.data;

      if (data === "action=confirm") {
        const userId = event.source.userId;
        const dataToSave = tempStore[userId];

        if (!dataToSave) {
          console.log("沒有找到暫存資料");
          await replyText(
            event.replyToken,
            "找不到暫存資料，請重新輸入記帳內容",
          );
          continue;
        }

        try {
          for (const item of dataToSave) {
            const [name, amount] = item.replace("元", "").trim().split(/\s+/);

            await notion.pages.create({
              parent: {
                database_id: process.env.NOTION_DATABASE_ID,
              },
              properties: {
                名稱: {
                  title: [
                    {
                      text: {
                        content: name,
                      },
                    },
                  ],
                },
                金額: {
                  number: Number(amount),
                },
                日期: {
                  date: {
                    start: new Date().toISOString().split("T")[0],
                  },
                },
                收支: {
                  select: {
                    name: "支出",
                  },
                },
              },
            });
          }
          delete tempStore[userId];
          await replyText(
            event.replyToken,
            `已記帳：\n${dataToSave.join("\n")}`,
          );
        } catch (error) {
          console.error("❌ Notion 記帳失敗:", error.message);
          await replyText(event.replyToken, "Notion 記帳失敗");
        }
      }

      if (data === "action=cancel") {
        const userId = event.source.userId;
        delete tempStore[userId];
        await replyText(event.replyToken, "已取消記帳");
      }
      continue;
    }

    if (event.type !== "message" || event.message.type !== "text") continue;

    await handleCommand(event);
  }

  console.log("========== 結束 ==========");
  res.status(200).send("OK");
});

// 處理功能指令
async function handleCommand(event) {
  const text = event.message.text;
  const lines = text.split("\n");
  const command = lines[0].trim();

  if (command === "記帳") {
    const result = handleExpense(lines);

    if (!result || result.length === 0) {
      await replyText(event.replyToken, "沒有找到可記帳的內容，請重新輸入><");
      return;
    }

    const userId = event.source.userId;
    tempStore[userId] = result;

    await replyConfirm(event.replyToken, result);
    return;
  }
  console.log("未知指令", command);
  await replyText(event.replyToken, "目前僅支援記帳！");
}

// 處理記帳
function handleExpense(lines) {
  let message = [];
  for (const [index, line] of lines.entries()) {
    const cleanLine = line.trim();

    if (index === 0 || !cleanLine) continue;

    const match = cleanLine.match(/^(.+?)(?::|\s+)?(\d+)$/);

    if (match) {
      const item = match[1].trim();
      const amount = Number(match[2]);

      console.log("・記帳項目");
      console.log("・項目：", item);
      console.log("・金額：", amount);

      message.push(`${item} ${amount} 元`);
    } else {
      console.log("❌ 無法解析:", cleanLine);
    }
  }
  return message;
}

// LINE BOT 確認回覆
async function replyConfirm(replyToken, message) {
  if (!message || message.length === 0) return;

  const text = `要記帳嗎？ \n${message.join("\n")}`;

  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",

      {
        replyToken,

        messages: [
          {
            type: "template",

            altText: "確認記帳",

            template: {
              type: "confirm",

              text,

              actions: [
                {
                  type: "postback",

                  label: "確認",

                  data: "action=confirm",
                },

                {
                  type: "postback",

                  label: "取消",

                  data: "action=cancel",
                },
              ],
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,

          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(
      "❌ Confirm 回覆失敗:",
      error.response?.data || error.message,
    );
  }
}

// LINE BOT 文字回覆
async function replyText(replyToken, text) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [
          {
            type: "text",
            text,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      },
    );
  } catch (error) {
    console.error("LINE文字回覆失敗：", error.response?.data || error.message);
  }
}

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
