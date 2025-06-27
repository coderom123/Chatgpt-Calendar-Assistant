// routes/outlookCalendar.js

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require("cors");

const router = express.Router();


const outlookAuthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
  `client_id=${process.env.OUTLOOK_CLIENT_ID}&response_type=code&redirect_uri=${process.env.OUTLOOK_REDIRECT_URI}` +
  `&scope=Calendars.ReadWrite offline_access`;


module.exports = function(outlookAccessTokenRef) {
  
  router.get('/auth', (req, res) => {
    res.redirect(outlookAuthUrl);
  });

  router.get('/redirect', async (req, res) => {
    const code = req.query.code;
    try {
      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: process.env.OUTLOOK_CLIENT_ID,
          client_secret: process.env.OUTLOOK_CLIENT_SECRET,
          redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
          code: code,
          grant_type: 'authorization_code'
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      outlookAccessTokenRef.current = tokenResponse.data.access_token;
      res.send("Successfully logged in to Outlook");
    } catch (error) {
      console.error("Couldn't get Outlook token:", error.response?.data || error.message);
      res.status(500).send("Outlook login failed");
    }
  });

  router.get('/events', async (req, res) => {
    if (!outlookAccessTokenRef.current) {
      return res.status(401).send("Not authenticated with Outlook!");
    }
    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me/events', {
        headers: {
          Authorization: `Bearer ${outlookAccessTokenRef.current}`,
          Prefer: 'outlook.timezone="Asia/Kolkata"'
        }
      });

      const events = response.data.value || [];
      const limitedEvents = events.slice(0, 10).map(event => ({
        summary: event.subject,
        description: event.bodyPreview || '',
        start: event.start?.dateTime,
        end: event.end?.dateTime
      }));

      res.status(200).json(limitedEvents);
    } catch (error) {
      console.error("Error fetching Outlook events:", error.response?.data || error.message);
      res.status(500).send("Error fetching events");
    }
  });

  router.post('/addEvent', async (req, res) => {
    if (!outlookAccessTokenRef.current) {
      return res.status(401).send("Not authenticated with Outlook!");
    }
    try {
      const { summary, description, start, end, timeZone } = req.body;
      const event = {
        subject: summary,
        body: { contentType: "text", content: description || "" },
        start: { dateTime: start, timeZone: timeZone || "Asia/Kolkata" },
        end: { dateTime: end, timeZone: timeZone || "Asia/Kolkata" }
      };

      const response = await axios.post('https://graph.microsoft.com/v1.0/me/events', event, {
        headers: {
          Authorization: `Bearer ${outlookAccessTokenRef.current}`,
          'Content-Type': 'application/json'
        }
      });

      res.status(200).json({
        message: 'Event created successfully',
        eventId: response.data.id
      });
    } catch (error) {
      console.error("Error inserting Outlook event:", error.response?.data || error.message);
      res.status(500).send("Error inserting event");
    }
  });

  return router;
};
