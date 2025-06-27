require('dotenv').config();
const express = require('express');
const cors = require("cors");
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.use(express.static(path.join(__dirname, 'public')));


const outlookAccessTokenRef = { current: null };


const googleCalendarRoutes = require('./routes/googleCalendar'); // already set up
const outlookCalendarRoutes = require('./routes/outlookCalendar')(outlookAccessTokenRef);
const assistantRoutes = require('./routes/assistant')(googleCalendarRoutes.oauth2Client, outlookAccessTokenRef);


// app.use('/googleCalendar', googleCalendarRoutes);
app.use('/googleCalendar', googleCalendarRoutes.router);
app.use('/outlookCalendar', outlookCalendarRoutes);
app.use('/assistant', assistantRoutes);

app.get('/', (req, res) => {
  res.send('to get assistant add assistant in your tab');
});

app.get('/assistant', (req, res) => {
  res.render('index'); 
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
