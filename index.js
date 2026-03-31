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

function getDiscordTimestamp() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);

  const chicagoNow = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(now)
  );

  const januaryOffsetCheck = new Date(`${year}-01-15T17:00:00`);
  const julyOffsetCheck = new Date(`${year}-07-15T17:00:00`);

  const chicagoJan = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(januaryOffsetCheck)
  );

  const chicagoJul = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(julyOffsetCheck)
  );

  const isDstLike =
    chicagoNow.getTimezoneOffset() === chicagoJul.getTimezoneOffset();

  const utcHour = isDstLike ? 22 : 23; // 5 PM Chicago = 22 UTC in DST, 23 UTC otherwise

  return Math.floor(Date.UTC(year, month - 1, day, utcHour, 0, 0) / 1000);
}

function buildScrumBody() {
  const timestamp = getDiscordTimestamp();

  return `Slimera Stand Up Meeting NotePad <t:${timestamp}:f> 🚀  
<@&1101598462706991125> <@&1008970348282253312>

# Sprint Focus: Stability + Content Output

**Game Goal:**  
- Big Hit List (Mass quick updates)

**Why:**  
Increase baseline CCU + move toward sustainability before full Algo push

**Success Metrics:**  
- CCU increase  
- 7 day play days per user signal increase
- 7 day intentional co-play days per user
- Retention lift (D1 if possible)  
- No major bugs post-release  

**Development Priorities:**  
- Finish biome update
- First 5 minutes
- Remove any progression blockers
- Reduce friction / confusion  
- Fix high-impact bugs  

**Community & Communication Goal:**  
Strengthen consistency + player trust  
- Daily/recurring updates  
- Clear roadmap communication  
- Feedback loop visibility  
- Patch notes clarity  
- Dev-progress storytelling  

**Why:**  
Build long-term loyalty + make players feel involved in the growth of Slimera`;
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

  const chicagoTimeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());

  const timeMap = {};
  for (const part of chicagoTimeParts) {
    if (part.type !== "literal") {
      timeMap[part.type] = part.value;
    }
  }

  const hour = Number(timeMap.hour);
  const minute = Number(timeMap.minute);

  if (!isWeekday(weekday)) {
    console.log("It is a weekend, so no scrum thread was created.");
    return;
  }

  if (hour !== 17 || minute > 5) {
    console.log("Not the 5 PM Chicago scrum window. Skipping.");
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