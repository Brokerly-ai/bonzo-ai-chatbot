require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const https = require('https');
const app = express();

// TLS config to prevent SSL error
const agent = new https.Agent({
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  rejectUnauthorized: false
});

const BONZO_TOKEN = process.env.BONZO_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const POLLING_INTERVAL = 60000; // 60 seconds

const SYSTEM_PROMPT = `You’re a helpful mortgage chatbot. Answer basic questions about DSCR loans and collect loan amount, property value, and rental income. Escalate to a real LO if the user wants a call.`;

// ✅ Corrected Bonzo API Base URL
const BONZO_API_BASE = 'https://app.getbonzo.com/api/v3';

async function fetchConversations() {
  const res = await fetch(`${BONZO_API_BASE}/conversations`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    agent: agent
  });
  return res.json();
}

async function fetchChatMessages(chatRoomId) {
  const res = await fetch(`${BONZO_API_BASE}/chat/${chatRoomId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    agent: agent
  });
  return res.json();
}

async function sendBonzoReply(chatRoomId, message) {
  await fetch(`${BONZO_API_BASE}/chat/${chatRoomId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message }),
    agent: agent
  });
}

async function askGPT(userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
  try {
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
  } catch (err) {
    console.error('Polling error:', err.message || err);
  }
}

// Poll every 60 seconds
setInterval(pollAndRespond, POLLING_INTERVAL);

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Bonzo AI Chatbot is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


