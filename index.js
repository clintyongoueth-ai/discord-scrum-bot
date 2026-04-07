require("dotenv").config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_FORUM_CHANNEL_ID = process.env.DISCORD_FORUM_CHANNEL_ID;
const TIMEZONE = process.env.TIMEZONE || "America/Chicago";

if (!DISCORD_BOT_TOKEN || !DISCORD_FORUM_CHANNEL_ID) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_FORUM_CHANNEL_ID in environment");
  process.exit(1);
}

function getZonedDateParts(date = new Date(), timeZone = TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    month: Number(map.month),
    day: Number(map.day),
    year: Number(map.year),
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getOffsetMinutesAt(date, timeZone) {
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!tzName || !tzName.startsWith("GMT")) {
    throw new Error(`Unable to determine timezone offset for ${timeZone}`);
  }

  if (tzName === "GMT") return 0;

  const match = tzName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unexpected timezone offset format: ${tzName}`);
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || "0");
  return sign * (hours * 60 + minutes);
}

function zonedLocalTimeToUnix({ year, month, day, hour, minute, second }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);

  const offsetMinutes1 = getOffsetMinutesAt(new Date(utcGuess), timeZone);
  let corrected = utcGuess - offsetMinutes1 * 60 * 1000;

  const offsetMinutes2 = getOffsetMinutesAt(new Date(corrected), timeZone);
  if (offsetMinutes2 !== offsetMinutes1) {
    corrected = utcGuess - offsetMinutes2 * 60 * 1000;
  }

  return Math.floor(corrected / 1000);
}

function getNextBusinessDayDate(timeZone = TIMEZONE) {
  const { year, month, day } = getZonedDateParts(new Date(), timeZone);
  const date = new Date(Date.UTC(year, month - 1, day));

  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getMeetingContext(timeZone = TIMEZONE) {
  const meetingDate = getNextBusinessDayDate(timeZone);
  const unixTimestamp = zonedLocalTimeToUnix(
    {
      year: meetingDate.year,
      month: meetingDate.month,
      day: meetingDate.day,
      hour: 17,
      minute: 0,
      second: 0,
    },
    timeZone
  );

  const meetingDateParts = getZonedDateParts(new Date(unixTimestamp * 1000), timeZone);
  return {
    meetingDate,
    meetingDateParts,
    unixTimestamp,
  };
}

function buildThreadTitle(meetingDate) {
  const shortYear = String(meetingDate.year).slice(-2);
  return `(${meetingDate.month}/${meetingDate.day}/${shortYear}) Scrum Meeting`;
}

function buildScrumBody(timestamp) {
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

function buildExampleScrumNotesBody() {
  return `# Example Scrum Notes

**How you been recently?**
- 

**To-Do List**
*What your working + what you have next*
- 

**Any minor / major blocks in THE NEXT 2 __WEEKS__?**
- 

**Comfort with your work?**
-

-----------------------------------
**Questions to Anyone else?**
-`;
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
    name,
    message: {
      content
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
  return data;
}

async function postThreadMessage(threadId, content) {
  const url = `https://discord.com/api/v10/channels/${threadId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Failed to post example scrum notes message.");
    console.error("Status:", response.status);
    console.error("Response:", data);
    process.exit(1);
  }

  console.log("Posted example scrum notes message:", data.id);
}

async function threadAlreadyExists(threadName) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_FORUM_CHANNEL_ID}/threads/search?sort_by=last_message_time&sort_order=desc`;
  const data = await discordGet(url);

  const threads = data.threads || [];
  return threads.some((thread) => thread.name === threadName);
}

async function main() {
  const now = new Date();
  const nowParts = getZonedDateParts(now, TIMEZONE);

  const { meetingDate, meetingDateParts, unixTimestamp } = getMeetingContext(TIMEZONE);

  console.log(
    `Current local time (${TIMEZONE}): ${nowParts.weekday} ${nowParts.month}/${nowParts.day}/${nowParts.year} ${String(nowParts.hour).padStart(2, "0")}:${String(nowParts.minute).padStart(2, "0")}:${String(nowParts.second).padStart(2, "0")}`
  );
  console.log(
    `Computed target meeting datetime (${TIMEZONE}): ${meetingDateParts.weekday} ${meetingDate.month}/${meetingDate.day}/${meetingDate.year} 17:00:00`
  );
  console.log(`Final Discord epoch: ${unixTimestamp}`);

  const title = buildThreadTitle(meetingDate);

  const exists = await threadAlreadyExists(title);
  if (exists) {
    console.log("Thread already exists:", title);
    return;
  }

  const createdThread = await createForumThread(title, buildScrumBody(unixTimestamp));
  await postThreadMessage(createdThread.id, buildExampleScrumNotesBody());
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});