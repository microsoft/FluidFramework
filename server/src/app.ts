import * as express from 'express';
var expressSession = require('express-session'); 
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var passportOpenIdConnect = require('passport-openidconnect');
var google = require('passport-google-oauth');
var facebook = require('passport-facebook');
var linkedin = require('passport-linkedin');

import * as siteRoute from './routes/site';
import * as usersRoute from './routes/users';
import * as authRoute from './routes/auth';
import * as connectRoute from './routes/connect';
import * as knowledgeRoute from './routes/knowledge';
import * as documentsRoute from './routes/documents';
import * as calendarsRouter from './routes/calendars';
import * as browserRoute from './routes/browser';
import * as loaderRoute from './routes/loader';
import * as excelRoute from './routes/excel';
import * as viewsRoute from './routes/views';
import * as collabRoute from './routes/collab';
import * as canvasRoute from './routes/canvas';

import * as passport from 'passport';
import * as connectRedis from 'connect-redis';
import * as moment from 'moment';
import * as nconf from 'nconf';
import * as redis from 'redis';
import * as request from 'request';
import * as accounts from './accounts';

// initialize session store - if redis is configured we will use it - otherwise will default to the memory store
var sessionStore;
if (nconf.get('redis')) {
    console.log("Using redis for session storage");
    var RedisStore = connectRedis(expressSession);

    if (nconf.get("redis:pass")) {
        
    }

    // Apply custom options if specified
    var options: any = null;
    if (nconf.get('redis:tls')) {
        options = {
            auth_pass: nconf.get("redis:pass")
        };

        options.tls = {
            servername: nconf.get("redis:host")
        }

        // Azure seems to lose our Redis client for SSL connections - we ping it to keep it alive.    
        setInterval(() => {
            redisClient.ping((error, result) => {
                if (error) {
                    console.log("Ping error: " + error);
                }
            });
        }, 60 * 1000);
    }

    // Create the client
    var redisClient = redis.createClient(
        nconf.get("redis:port"),
        nconf.get("redis:host"),
        options);

    sessionStore = new RedisStore({ client: redisClient });
}
else {
    console.log("Using memory for session storage");
    sessionStore = new expressSession.MemoryStore();
}

// Express app configuration
var app = express();

// Running behind iisnode
app.set('trust proxy', 1);

// view engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'hjs');

// Right now we simply pass through the entire stored user object to the session storage for that user
passport.serializeUser((user, done) => {
    done(null, user.user.id);
});

passport.deserializeUser((id, done) => {
    accounts.getUser(id).then((user) => done(null, user), (error) => done(error, null));
});

function completeAuthentication(
    provider: string,
    providerId: string,
    accessToken: string,
    expires: number,
    refreshToken: string,
    details: accounts.IUserDetails,
    done: (error: any, user?: any) => void) {

    let expiration = accounts.getTokenExpiration(expires);        
    var userP = accounts.createOrGetUser(provider, providerId, accessToken, expiration, refreshToken, details);
    userP.then(
        (user) => {
            done(null, user);
        },
        (error) => {
            done(error, null);            
        });
}

function connectAccount(
    provider: string,
    providerId: string,
    accessToken: string,
    expires: number,
    refreshToken: string,
    userId: string,
    done: (error: any, user?: any) => void) {
    
    let expiration = accounts.getTokenExpiration(expires);
    let linkP = accounts.linkAccount(provider, providerId, accessToken, expiration, refreshToken, userId);
    linkP.then(
        (user) => {
            done(null, user);
        },
        (error) => {
            console.log(error);
            done(error, null);            
        });
}

var linkedinConfiguration = nconf.get("login:linkedin");
passport.use(
    new linkedin({
        consumerKey: linkedinConfiguration.clientId,
        consumerSecret: linkedinConfiguration.secret,
        callbackURL: "/auth/linkedin/callback",
        profileFields: ['id', 'first-name', 'last-name', 'email-address', 'headline'],        
        passReqToCallback: true
    },
    (req, accessToken, refreshToken, params, profile, done) => {
        if (!req.user) {
            completeAuthentication(
                'linkedin', 
                profile.id, 
                accessToken,
                params.expires_in,
                refreshToken, 
                { 
                    displayName: profile.displayName,
                    name: profile.name
                },
                done);
        }
        else {
            connectAccount('linkedin', profile.id, accessToken, params.expires_in,refreshToken, req.user.user.id, done);
        }
    }));

var facebookConfiguration = nconf.get("login:facebook");
passport.use(
    new facebook({
        clientID: facebookConfiguration.clientId,
        clientSecret: facebookConfiguration.secret,
        callbackURL: "/auth/facebook/callback",
        profileFields: ['id', 'displayName', 'email', 'name', 'gender'],
        passReqToCallback: true
    },
    (req, accessToken, refreshToken, params, profile, done) => {
        if (!req.user) {
            completeAuthentication(
                'facebook', 
                profile.id, 
                accessToken,
                params.expires_in,
                refreshToken, 
                { 
                    displayName: profile.displayName,
                    name: profile.name
                },
                done);
        }
        else {
            connectAccount('facebook', profile.id, accessToken, params.expires_in,refreshToken, req.user.user.id, done);
        }
    }));

var googleConfiguration = nconf.get("login:google");
passport.use(
    new google.OAuth2Strategy({
        clientID: googleConfiguration.clientId,
        clientSecret: googleConfiguration.secret,
        callbackURL: '/auth/google/callback',
        passReqToCallback: true
    },
    (req, accessToken, refreshToken, params, profile, done) => {        
        if (!req.user) {
            completeAuthentication(
                'google', 
                profile.id, 
                accessToken,
                params.expires_in,
                refreshToken, 
                { 
                    displayName: profile.displayName,
                    name: profile.name
                },
                done);
        }
        else {
            connectAccount('google', profile.id, accessToken, params.expires_in,refreshToken, req.user.user.id, done);            
        }             
    }));

var microsoftConfiguration = nconf.get("login:microsoft");
passport.use(
    new passportOpenIdConnect.Strategy({
        authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        callbackURL: '/auth/microsoft/callback',
        clientID: microsoftConfiguration.clientId,        
        clientSecret: microsoftConfiguration.secret,
        skipUserProfile: true,
        passReqToCallback: true                 
    },
    (req, iss, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
        console.log(params);
        if (!req.user) {            
            // use request to load in the user profile
            request.get('https://graph.microsoft.com/v1.0/me', { auth: { 'bearer': accessToken }, json: true }, (error, response, body) => {
                console.log('User profile information');
                console.log(JSON.stringify(body, null, 2));            

                completeAuthentication(
                    'microsoft', 
                    sub, 
                    accessToken, 
                    params.expires_in,
                    refreshToken,                     
                    { 
                        displayName: body.displayName,
                        name: {
                            familyName: body.surname,
                            givenName: body.givenName
                        }
                    },
                    done);                  
            });
        }
        else {
            connectAccount('microsoft', sub, accessToken, params.expires_in, refreshToken, req.user.user.id, done);
        }                        
    }));

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(expressSession({ secret: 'bAq0XuQWqoAZzaAkQT5EXPCHBkeIEZqi', resave: false, saveUninitialized: false, store: sessionStore, cookie: { maxAge: 1000 * 60 * 60 * 24 } }));
app.use(require('less-middleware')(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));
// The below is to check to make sure the session is available (redis could have gone down for instance) and if
// not return an error
app.use((request, response, next) => {
    if (!request.session) {
        return next(new Error('Session not available'))
    }
    else {
        next() // otherwise continue 
    }
});
app.use(passport.initialize());
app.use(passport.session());

// enable CORS headers for all routes for now
app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", "*");
    response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});
app.use('/', siteRoute);
app.use('/auth', authRoute);
app.use('/connect', connectRoute);
app.use('/users', usersRoute);
app.use('/knowledge', knowledgeRoute);
app.use('/documents', documentsRoute);
app.use('/loader', loaderRoute);
app.use('/excel', excelRoute);
app.use('/collab', collabRoute);
app.use('/canvas', canvasRoute);

calendarsRouter.crouter.init();
app.use('/calendars', calendarsRouter.crouter.router);
app.use('/browser', browserRoute);
app.use('/views', viewsRoute);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    (<any>err).status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
