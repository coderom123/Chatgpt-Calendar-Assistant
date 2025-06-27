require('dotenv').config();

const express = require('express');
const { google } = require('googleapis');
const cors = require("cors");
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());
const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.SECRET_ID,
    process.env.REDIRECT
  );


  
  // Route to handle the OAuth2 callback
  router.get('/auth', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request offline access to receive a refresh token
      scope: 'https://www.googleapis.com/auth/calendar.events' // Scope for read-only access to the calendar
    });
    res.redirect(url);
    // res.redirect(('googleCalendar') + url);
  });

  router.get('/redirect', (req, res) => {
    const code = req.query.code;
    
    // Exchange the code for tokens
    oauth2Client.getToken(code, (err, tokens) => {
      if (err) {
        console.error('Couldn\'t get token', err);
        res.send('Error');
        return;
      }
      
      oauth2Client.setCredentials(tokens);
      res.send('Successfully logged in');
    });
  });
  
  // Route to list all calendars
  router.get('/calendars', (req, res) => {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    calendar.calendarList.list({}, (err, response) => {
      if (err) {
        console.error('Error fetching calendars', err);
        res.end('Error!');
        return;
      }
      const calendars = response.data.items;
      res.json(calendars);
    });
  });
  
  // Route to list events from a specified calendar
  router.get('/events', (req, res) => {
    // Get the calendar ID from the query string, default to 'primary'
    const calendarId = req.query.calendar ?? 'primary';
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    calendar.events.list({
      calendarId,
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    }, (err, response) => {
      if (err) {
        console.error('Can\'t fetch events');
        res.send('Error');
        return;
      }
      
       const events = response.data.items || [];
      
       const filteredEvents = events.map(event => ({
         summary: event.summary,
         description: event.description,
         start: event.start?.dateTime || event.start?.date, 
         end: event.end?.dateTime || event.end?.date,       
       }));
   
      
       return res.json(filteredEvents); 
  
    //for full json data
      // const events = response.data.items;
      // res.json(events);
    });
  });
  
  
  router.post("/addEvent",  async (req, res) => {
      try{
        const calendar = google.calendar({ version: 'v3' , auth :oauth2Client});
        const{ summary , description , start, end, timeZone}= req.body;
        
        const event = {
          summary,
          description,
          start:{
            dateTime: start,
            timeZone : timeZone || 'Asia/kolkata'
          },
          end:{
            dateTime: end,
            timeZone: timeZone || 'Asia/kolkata'
          }
        };
  
        const response = await calendar.events.insert({
          calendarId:'primary',
          resource: event
        });
        res.status(200).json({
          message: 'Event created successfully',
          eventId: response.data.id
        });
      } catch (error) {
        console.error('Error inserting event:', error);
        res.status(500).send('Error inserting event');
      }
      }
  );

  
// module.exports = oauth2Client;
// module.exports = router;
// module.exports = router , oauth2Client ;
module.exports = { router, oauth2Client };
