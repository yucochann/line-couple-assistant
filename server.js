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
      const params = new URLSearchParams(data);

      if (params.get("action") === "select") {
        const type = params.get("type");
        const userId = event.source.userId;

        console.log("使用者選擇收支", type);

        tempStore[userId] = {
          mode: "ledger",
          type: type,
          step: "waitingItems",
        };

        await replyText(
          event.replyToken,
          type === "expense"
            ? "請輸入支出項目與金額，例如：\n早餐 80\n咖啡 120"
            : "請輸入收入項目與金額，例如：\n薪水 30000\n獎金 5000",
        );

        console.log(tempStore[userId]);
        return;
      }

      if (data === "action=confirm") {
        const userId = event.source.userId;
        const dataToSave = tempStore[userId];
        const itemsToSave = dataToSave ? dataToSave.items : null;

        if (!itemsToSave || itemsToSave.length === 0) {
          console.log("沒有找到暫存資料");
          await replyText(
            event.replyToken,
            "找不到暫存資料，請重新輸入記帳內容",
          );
          continue;
        }

        try {
          for (const item of itemsToSave) {
            const [name, amount, currency] = item.split("|");

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
                    name: dataToSave.type === "expense" ? "支出" : "收入",
                  },
                },
                幣值: {
                  select: {
                    name: currency,
                  },
                },
              },
            });
          }
          delete tempStore[userId];
          const display = itemsToSave.map((m) => {
            const [name, amount, currency] = m.split("|");
            return `${name} ${amount} ${currency}`;
          });
          await replyText(event.replyToken, `已記帳：\n${display.join("\n")}`);
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
  const userId = event.source.userId;
  const userState = tempStore[userId];
  const text = event.message.text;
  const lines = text.split("\n");
  const command = lines[0].trim();

  if (userState && userState.step === "waitingItems") {
    const result = handleExpense(["記帳", ...lines]);

    if (!result || result.length === 0) {
      await replyText(event.replyToken, "請重新輸入記帳內容");
      return;
    }

    tempStore[userId] = {
      mode: "ledger",
      type: userState.type,
      step: "confirming",
      items: result,
    };

    console.log("解析結果:", result);

    await replyConfirm(event.replyToken, result);
    return;
  }

  if (command === "記帳") {
    console.log("使用者要記帳");
    await replyTypeSelect(event.replyToken);
    return;
  }

  console.log("未知指令:", command);
  await replyText(event.replyToken, "目前支援的指令：記帳");
}

// 處理收入支出

// 處理記帳
function handleExpense(lines) {
  let message = [];
  for (const [index, line] of lines.entries()) {
    const cleanLine = line.trim();

    if (index === 0 || !cleanLine) continue;

    const match = cleanLine.match(/^(.+?)\s*(\d+)\s*(澳|AUD|日|JPY)?$/);

    if (match) {
      const item = match[1].trim();
      const amount = Number(match[2]);
      const currencyRaw = match[3];

      let currency = "台幣";
      if (currencyRaw === "澳" || currencyRaw === "AUD") currency = "澳幣";
      if (currencyRaw === "日" || currencyRaw === "JPY") currency = "日幣";

      message.push(`${item}|${amount}|${currency}`);
    } else {
      console.log("❌ 無法解析:", cleanLine);
    }
  }
  return message;
}

// LINE BOT 收入支出選項
async function replyTypeSelect(replyToken) {
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [
          {
            type: "template",
            altText: "請選擇收入或支出",
            template: {
              type: "buttons",
              text: "請選擇收入或支出",
              actions: [
                {
                  type: "postback",
                  label: "收入",
                  data: "action=select&type=income",
                },
                {
                  type: "postback",
                  label: "支出",
                  data: "action=select&type=expense",
                },
              ],
            },
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
    console.error(
      "LINE收入支出選項失敗：",
      error.response?.data || error.message,
    );
  }
}

// LINE BOT 確認回覆
async function replyConfirm(replyToken, message) {
  if (!message || message.length === 0) return;

  const display = message.map((m) => {
    const [name, amount, currency] = m.split("|");
    return `${name} ${amount} ${currency}`;
  });
  const text = `要記帳嗎？ \n${display.join("\n")}`;

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
