require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const app = express();

const BONZO_TOKEN = process.env.BONZO_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const POLLING_INTERVAL = 60000;

const SYSTEM_PROMPT = `You’re a helpful mortgage chatbot. Answer basic questions about DSCR loans and collect loan amount, property value, and rental income. Escalate to a real LO if the user wants a call.`;

async function fetchConversations() {
  const res = await fetch('https://api.bonzo.ai/v3/conversations', {
    headers: {
      'Authorization': `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

async function fetchChatMessages(chatRoomId) {
  const res = await fetch(`https://api.bonzo.ai/v3/chat/${chatRoomId}`, {
    headers: {
      'Authorization': `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

async function sendBonzoReply(chatRoomId, message) {
  await fetch(`https://api.bonzo.ai/v3/chat/${chatRoomId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
}

async function askGPT(userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}

let lastMessageIds = {};

async function pollAndRespond() {
  const conversations = await fetchConversations();

  for (const convo of conversations) {
    const chatRoomId = convo.id;
    const messages = await fetchChatMessages(chatRoomId);
    const lastMsg = messages[messages.length - 1];

    if (!lastMessageIds[chatRoomId] || lastMessageIds[chatRoomId] !== lastMsg.id) {
      lastMessageIds[chatRoomId] = lastMsg.id;
      if (lastMsg.sender === 'lead') {
        const reply = await askGPT(lastMsg.text);
        await sendBonzoReply(chatRoomId, reply);
      }
    }
  }
}

setInterval(pollAndRespond, POLLING_INTERVAL);

app.get('/', (req, res) => {
  res.send('Bonzo AI Chatbot is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
