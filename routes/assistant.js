// const express = require('express');
// const axios = require('axios');
// const router = express.Router();
// const openai = require('openai');

// router.post('/', async (req, res) => {
//   const { message } = req.body;

//   if (!message) {
//     return res.status(400).json({ error: 'Message is required' });
//   }

//   try {
//     const response = await axios.post(
//       'https://api.openai.com/v1/chat/completions',
//       {
//         model: "gpt-4o-mini", 
//         messages: [{ role: 'user', content: message }],
//         max_tokens: 150,
//         temperature: 0.7
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//           'Content-Type': 'application/json'
//         }
//       }
//     );

//     const reply = response.data.choices[0].message.content;
//     res.json({ reply });
//   } catch (error) {
//     console.error("ChatGPT API error:", error.response?.data || error.message);
//     res.status(500).json({ error: 'Failed to fetch response from ChatGPT' });
//   }
// });

// module.exports = router;

// routes/assistant.js
// routes/assistant.js
module.exports = function (oauth2Client, outlookAccessTokenRef) {
  const express = require('express');
  const axios = require('axios');
  const { google } = require('googleapis');
  const router = express.Router();
  const chrono = require('chrono-node');


  const userSessions = {};

  // Fetch Google Calendar events
  async function fetchGoogleEvents() {
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        timeMax: new Date(new Date().setHours(23, 59, 59)).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 10,
      });
      return res.data.items || [];
    } catch (error) {
      console.error('Google fetch error:', error.message);
      return [];
    }
  }

  // Fetch Outlook events
  async function fetchOutlookEvents() {
    if (!outlookAccessTokenRef.current) return [];
    try {
      const res = await axios.get('https://graph.microsoft.com/v1.0/me/calendarview', {
        headers: { Authorization: `Bearer ${outlookAccessTokenRef.current}` },
        params: {
          startDateTime: new Date().toISOString(),
          endDateTime: new Date(new Date().setHours(23, 59, 59)).toISOString()
        }
      });
      return res.data.value || [];
    } catch (error) {
      console.error("Outlook fetch error:", error.message);
      return [];
    }
  }

  router.post('/', async (req, res) => {
    const { message } = req.body;
    const userId = req.ip;

    const rescheduleKeywords = ["reschedule", "move", "postpone", "change time" ,"Conflict"];
    const isRescheduleIntent = rescheduleKeywords.some(word => message.toLowerCase().includes(word));

    // Step 1: Check if waiting for calendar type from user
    if (userSessions[userId]?.awaitingCalendarChoice) {
      const calendarChoice = message.toLowerCase().includes("google") ? "google" :
                             message.toLowerCase().includes("outlook") ? "outlook" : null;

      if (!calendarChoice) {
        return res.json({ reply: "Please specify 'Google' or 'Outlook' to continue rescheduling." });
      }

      const { eventToMove, newTime } = userSessions[userId];
      const endTime = new Date(new Date(newTime).getTime() + 30 * 60000).toISOString();

      try {
        if (calendarChoice === "google") {
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          await calendar.events.update({
            calendarId: 'primary',
            eventId: eventToMove.id,
            resource: {
              ...eventToMove,
              start: { dateTime: newTime, timeZone: "Asia/Kolkata" },
              end: { dateTime: endTime, timeZone: "Asia/Kolkata" }
            }
          });
        } else {
          await axios.patch(
            `https://graph.microsoft.com/v1.0/me/events/${eventToMove.id}`,
            {
              start: { dateTime: newTime, timeZone: "Asia/Kolkata" },
              end: { dateTime: endTime, timeZone: "Asia/Kolkata" }
            },
            { headers: { Authorization: `Bearer ${outlookAccessTokenRef.current}` } }
          );
        }

        delete userSessions[userId];
        return res.json({ reply: `✅ Your event has been rescheduled to ${new Date(newTime).toLocaleTimeString()} in ${calendarChoice} calendar.` });
      } catch (err) {
        console.error("Error during rescheduling:", err.message);
        return res.json({ reply: `❌ Failed to reschedule the event.` });
      }
    }

    // Step 2: Sync calendars only when requested or checking conflicts
    const needsCalendar = ["calendar", "schedule", "meetings", "appointments", "my day", "today", "events"].some(word => message.toLowerCase().includes(word)) || isRescheduleIntent;

    if (needsCalendar) {
      const [googleEvents, outlookEvents] = await Promise.all([
        fetchGoogleEvents(),
        fetchOutlookEvents()
      ]);

      if (isRescheduleIntent) {
        const allEvents = [...googleEvents.map(e => ({ ...e, source: 'google' })), ...outlookEvents.map(e => ({ ...e, source: 'outlook' }))];
        allEvents.sort((a, b) => new Date(a.start?.dateTime || a.start?.date) - new Date(b.start?.dateTime || b.start?.date));

        const conflicts = [];
        for (let i = 0; i < allEvents.length - 1; i++) {
          const currentEnd = new Date(allEvents[i].end?.dateTime || allEvents[i].end?.date);
          const nextStart = new Date(allEvents[i + 1].start?.dateTime || allEvents[i + 1].start?.date);
          if (currentEnd > nextStart) {
            conflicts.push(allEvents[i]);
          }
        }

        // const matchTime = message.match(/(\d{1,2})(:\d{2})?\s?(AM|PM|am|pm)?/);
        // if (conflicts.length > 0 && matchTime) {
        //   const hour = parseInt(matchTime[1]);
        //   const mins = matchTime[2] ? parseInt(matchTime[2].slice(1)) : 0;
        //   const isPM = matchTime[3]?.toLowerCase() === "pm";
        //   const newHour = isPM ? (hour < 12 ? hour + 12 : hour) : hour;
        //   const newTime = new Date();
          
        //   newTime.setHours(newHour, mins, 0, 0);
        const matchTime = message.match(/(\d{1,2})(:\d{2})?\s?(AM|PM|am|pm|a.m.|p.m.|)?/);
if (conflicts.length > 0 && matchTime) {
  const hour = parseInt(matchTime[1]);
  const mins = matchTime[2] ? parseInt(matchTime[2].slice(1)) : 0;
  const ampmRaw = matchTime[3]?.toLowerCase().replace(/\./g, '');
  const isPM = ampmRaw === "pm";

  let newHour;
  if (isPM) {
    newHour = hour === 12 ? 12 : hour + 12;
  } else {
    newHour = hour === 12 ? 0 : hour;
  }

  const newTime = new Date();
  newTime.setHours(newHour, mins, 0, 0);

          const newTimeISO = newTime.toISOString();

          userSessions[userId] = {
            awaitingCalendarChoice: true,
            eventToMove: conflicts[0],
            newTime: newTimeISO
          };

          return res.json({
            reply: `⚠️ I found a conflicting event: "${conflicts[0].summary || conflicts[0].subject}". Do you want to move it to ${matchTime[0]} in Google or Outlook calendar?`
          });
        } else {
          return res.json({ reply: "No conflicting events found to reschedule." });
        }
      } else {
        // this is old 
        // let eventSummary = '';
        // googleEvents.forEach(event => {
        //   const start = event.start?.dateTime || event.start?.date;
        //   eventSummary += `Google: "${event.summary}" at ${start}. `;
        // });
        // outlookEvents.forEach(event => {
        //   const start = event.start?.dateTime || event.start?.date;
        //   eventSummary += `Outlook: "${event.subject}" at ${start}. `;
        // });

        // const prompt = `The user asked: "${message}". Today's synced events are: ${eventSummary}. Answer as a helpful assistant.`;
        let eventLines = [];

        googleEvents.forEach(event => {
        const start = event.start?.dateTime || event.start?.date;
        const time = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(start).toLocaleDateString();
        eventLines.push( `google - ${date} ${time} - ${event.summary || 'No title'}`);
        });
        
        outlookEvents.forEach(event => {
        const start = event.start?.dateTime || event.start?.date;
        const time = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(start).toLocaleDateString();
        eventLines.push( `Outlook - ${date} ${time} - ${event.subject || 'No title'}`);
        });
        
        const eventSummary = eventLines.join('\n');
        const prompt = `You are a helpful assistant. The user asked: "${message}". Based on the following events, write a short friendly summary. Then, list each event on a new line as:\n• [Calendar] [Time] - [Title]\n\nEvents:\n${eventSummary}`;

        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: "gpt-4o-mini",
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.7
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        return res.json({ reply: response.data.choices[0].message.content ,
          
         });
        
      }
    }

    // Default fallback to ChatGPT
    const chatResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: message }],
        max_tokens: 300,
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ reply: chatResponse.data.choices[0].message.content });
  });

  return router;
};




