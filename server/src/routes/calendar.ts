import * as express from 'express';
import * as request from 'request';
import * as moment from 'moment';
import { Promise } from 'es6-promise';
import { IUser } from '../accounts';
import * as nconf from 'nconf';
import { defaultPartials } from './partials';
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var router = express.Router();

router.get('/', (req: express.Request, response: express.Response) => {
    let user = <IUser>(<any>req).user;

    if (!user) {
        return response.json([]);
    }

    let now = moment();
    let nextWeek = now.clone().add(7, 'days');

    var resultPromises = [];
    for (let account of user.accounts) {
        if (account.provider === 'microsoft') {
            var microsoftCalendarP = new Promise((resolve, reject) => {
                let url = `https://graph.microsoft.com/v1.0/me/calendar/calendarView?StartDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}`;
                request.get(
                    url,
                    { auth: { 'bearer': account.accessToken }, json: true }, (error, response, body) => {
                        if (error) {
                            reject(error);
                        }
                        else {                                                         
                            var microsoftResults = body.value.map((item) => ({
                                summary: item.subject, 
                                start: item.start.dateTime,
                                end: item.end.dateTime
                            }));
                            resolve({ provider: 'Microsoft', items: microsoftResults });
                        }
                    });
                })
            resultPromises.push(microsoftCalendarP);
        }
        else if (account.provider === 'google') {
            var googleCalendarP = new Promise((resolve, reject) => {
                    let calendar = google.calendar('v3');
                    var OAuth2 = google.auth.OAuth2;
                    var googleConfig = nconf.get("login:google");
                    var oauth2Client = new google.auth.OAuth2(googleConfig.clientId, googleConfig.secret, '/auth/google');;

                    // Retrieve tokens via token exchange explained above or set them:
                    oauth2Client.setCredentials({
                        access_token: account.accessToken,
                        refresh_token: account.refreshToken
                    });

                    calendar.events.list({
                        auth: oauth2Client,
                        calendarId: 'primary',
                        timeMin: (new Date()).toISOString(),
                        maxResults: 10,
                        singleEvents: true,
                        orderBy: 'startTime'
                    }, function (err, response) {
                        if (err) {                        
                            return reject(err);
                        }
                        else {
                            var googleCalendarItems = response.items.map((item) => ({ 
                                summary: item.summary, 
                                start: item.start.dateTime,
                                end: item.end.dateTime
                            }));
                            console.log(JSON.stringify(googleCalendarItems, null, 2));
                            resolve({ provider: 'Google', items: googleCalendarItems });                        
                        }                    
                    });            
                });
            resultPromises.push(googleCalendarP);
        }            
    }

    Promise.all(resultPromises).then((results) => {     
        console.log(results.length);   
        response.render(
            'calendar',
            {
                user: user,
                partials: defaultPartials,
                viewModel: results
            });
    });    
});

export = router;