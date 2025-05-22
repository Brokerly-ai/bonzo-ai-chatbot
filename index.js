import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const BONZO_API_BASE = 'https://app.getbonzo.com/api/v3';
const BONZO_TOKEN = process.env.BONZO_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let lastMessageIds = {};

async function fetchConversations() {
  const res = await fetch(`${BONZO_API_BASE}/conversations`, {
    headers: {
      Authorization: `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return data?.data || [];
}

async function fetchChatMessages(chatRoomId) {
  const res = await fetch(`${BONZO_API_BASE}/conversations/${chatRoomId}`, {
    headers: {
      Authorization: `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return data?.data?.messages || [];
}

async function askGPT(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function sendBonzoReply(chatRoomId, message) {
  await fetch(`${BONZO_API_BASE}/chat/${chatRoomId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BONZO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });
}

async function pollAndRespond() {
  try {
    const res = await fetchConversations();
    console.log("Bonzo API response:", res);

    const conversations = Array.isArray(res)
      ? res
      : Array.isArray(res.data)
      ? res.data
      : [];

    if (!Array.isArray(conversations)) {
      throw new Error('Conversations response is not an array.');
    }

    for (const convo of conversations) {
      if (!convo || !convo.id) continue; // Safety check

      console.log("📨 Checking contact:", convo.full_name, convo.phone);

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
  } catch (error) {
    console.error('Polling error:', error.message);
  }
}

setInterval(pollAndRespond, 15000);
