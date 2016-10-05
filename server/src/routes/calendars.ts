import * as express from 'express';
import * as request from 'request';
import * as moment from 'moment';
import * as accounts from '../accounts';
import { Promise } from 'es6-promise';
import { IUser } from '../accounts';
import * as nconf from 'nconf';
import { defaultPartials } from './partials';
import { Link, ViewModel } from '../interfaces';
var google = require('googleapis');
var googleAuth = require('google-auth-library');

var router = express.Router();

/**
 * View model representing an event on a calendar
 */
class CalendarEvent implements ViewModel {
    _type = "https://graph.microsoft.com/models/calendar/event";
    _links: { [rel: string]: Link };

    constructor(self: string, public summary: string, public start: string, public end: string) {
        this.start = moment(start).toISOString();
        this.end = moment(end).toISOString();
        this._links = { "self": { href: self } };
    }
}

/**
 * View model representing a single calendar
 */
class CalendarViewModel implements ViewModel {
    _links: { [rel: string]: Link };
    _embedded: { [rel: string]: ViewModel[] };
    _type = "https://graph.microsoft.com/models/calendar";

    constructor(self: string, events: CalendarEvent[]) {
        this._embedded = { "item": events };
        this._links = { "self": { href: self } };
    }
}

/**
 * View model representing a collection of calendars
 */
class CalendarsViewModel implements ViewModel {
    _type = "https://graph.microsoft.com/models/calendars";
    _links: { [rel: string]: Link } = { "self": { href: "/calendars" } };
    _embedded: { [rel: string]: ViewModel[] };

    constructor(calendars: CalendarViewModel[]) {
        this._embedded = { "item": calendars };
    }
}

router.get('/', (req: express.Request, response: express.Response) => {
    let user = <IUser>(<any>req).user;

    if (!user) {
        return response.json([]);
    }

    let now = moment();
    let nextWeek = now.clone().add(7, 'days');

    var resultPromises: Promise<CalendarViewModel>[] = [];
    for (let account of user.accounts) {
        if (account.provider === 'microsoft') {
            var microsoftCalendarP = new Promise<ViewModel>((resolve, reject) => {
                return accounts.getTokens(account).then((tokens) => {
                    let url = `https://graph.microsoft.com/v1.0/me/calendar/calendarView?StartDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}`;
                    request.get(
                        url,
                        { auth: { 'bearer': tokens.access }, json: true }, (error, response, body) => {
                            if (error) {
                                return reject(error);
                            }
                            else {
                                // MSFT strings are in UTC but don't place the UTC marker in the date string - convert to this format to standardize the input
                                // to CalendarEvent
                                var microsoftResults = body.value.map((item) => 
                                    new CalendarEvent(`/calendars/microsoft/${item.id}`, item.subject, moment.utc(item.start.dateTime).toISOString(), moment.utc(item.end.dateTime).toISOString()));                                
                                let viewModel = new CalendarViewModel('/calendars/microsoft', microsoftResults);

                                return resolve(viewModel);
                            }
                        });
                })
            })
            resultPromises.push(microsoftCalendarP);
        }
        else if (account.provider === 'google') {
            var googleCalendarP = new Promise<ViewModel>((resolve, reject) => {
                return accounts.getTokens(account).then((tokens) => {
                    let calendar = google.calendar('v3');
                    var OAuth2 = google.auth.OAuth2;
                    var googleConfig = nconf.get("login:google");
                    var oauth2Client = new google.auth.OAuth2(googleConfig.clientId, googleConfig.secret, '/auth/google');;

                    // Retrieve tokens via token exchange explained above or set them:
                    oauth2Client.setCredentials({
                        access_token: tokens.access,
                        refresh_token: tokens.refresh
                    });

                    calendar.events.list({
                        auth: oauth2Client,
                        calendarId: 'primary',
                        timeMin: (new Date()).toISOString(),
                        maxResults: 10,
                        singleEvents: true,
                        orderBy: 'startTime'
                    }, (err, response) => {
                        if (err) {
                            return reject(err);
                        }
                        else {                                                        
                            var googleResults = response.items.map((item) => 
                                    new CalendarEvent(`/calendars/google/${item.id}`, item.summary, item.start.dateTime, item.end.dateTime));                                
                            let viewModel = new CalendarViewModel('/calendars/google', googleResults);

                            return resolve(viewModel);
                        }
                    });
                });
            });

            resultPromises.push(googleCalendarP);
        }
    }

    Promise.all(resultPromises).then((calendars) => {
        let viewModel = new CalendarsViewModel(calendars);
        response.json(viewModel);
    }, (error) => {
        response.status(400).json(error);
    });
});

router.get('/views', (req: express.Request, response: express.Response) => {
    response.render(
        'calendar',
        {
            title: 'ProNet',
            user: (<any> req).user,
            partials: defaultPartials
        });
});

export = router;