require("dotenv").config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_FORUM_CHANNEL_ID = process.env.DISCORD_FORUM_CHANNEL_ID;
const TIMEZONE = process.env.TIMEZONE || "America/Chicago";

if (!DISCORD_BOT_TOKEN || !DISCORD_FORUM_CHANNEL_ID) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_FORUM_CHANNEL_ID in .env");
  process.exit(1);
}

function getDateParts() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    month: map.month,
    day: map.day,
    year: map.year,
    weekday: map.weekday,
  };
}

function isWeekday(weekday) {
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
}

function buildThreadTitle() {
  const { month, day, year } = getDateParts();
  return `(${month}/${day}/${year}) Scrum Meeting`;
}

function buildScrumBody() {
  return `How have you been recently?

To-Do List
What are you working on + what do you have next?

Any minor / major blocks in the next 2 weeks?

Comfort with your work?

Questions to anyone else?`;
}

async function discordGet(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("GET failed.");
    console.error("Status:", response.status);
    console.error("Response:", data);
    process.exit(1);
  }

  return data;
}

async function createForumThread(name, content) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_FORUM_CHANNEL_ID}/threads`;

  const body = {
    name: name,
    message: {
      content: content
    },
    auto_archive_duration: 1440
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Failed to create thread.");
    console.error("Status:", response.status);
    console.error("Response:", data);
    process.exit(1);
  }

  console.log("Created scrum thread successfully:", data.id);
}

async function threadAlreadyExists(threadName) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_FORUM_CHANNEL_ID}/threads/search?sort_by=last_message_time&sort_order=desc`;
  const data = await discordGet(url);

  const threads = data.threads || [];
  return threads.some(thread => thread.name === threadName);
}

async function main() {
  const { weekday } = getDateParts();

  if (!isWeekday(weekday)) {
    console.log("It is a weekend, so no scrum thread was created.");
    return;
  }

  const title = buildThreadTitle();

  const exists = await threadAlreadyExists(title);
  if (exists) {
    console.log("Thread already exists:", title);
    return;
  }

  await createForumThread(title, buildScrumBody());
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});