import { IUser } from '../accounts';
import * as express from 'express';
import * as _ from 'lodash';
import { defaultPartials } from './partials';
var router = express.Router();
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

// GET home page
router.get('/', (request, response, next) => {
    response.render(
        'index',
        {
            title: 'ProNet',
            user: request.user,
            partials: defaultPartials
        });
});

// User profile
router.get('/profile', ensureLoggedIn(), (request, response) => {
    // TODO need to verify that the user is actually logged in

    var user = <IUser> request.user;

    // Create base view model that we will update as we find more information
    var providers = {
        "google": { name: "Google", connected: false, connect: "/connect/google" },
        "microsoft": { name: "Microsoft", connected: false, connect: "/connect/microsoft" },
        "facebook": { name: "Facebook", connected: false, connect: "/connect/facebook" },
        "linkedin": { name: "LinkedIn", connected: false, connect: "/connect/linkedin" }
    };

    // Update based on the connected accounts
    for (var account of user.accounts) {
        providers[account.provider].connected = true;
        providers[account.provider].disconnect = `/connect/remove/${account.id}`;
    }

    let viewModel = _.keys(providers).map((key) => ({ provider: key, details: providers[key] }));

    response.render(
        'profile',
        {
            user: request.user,
            partials: defaultPartials,
            viewModel: viewModel
        });
});

// Login
router.get('/login', (request, response) => {
    response.render('login',
        {            
            partials: defaultPartials
        });
});

// Logout
router.get('/logout', (request, response) => {
    request.logout();
    response.redirect('/');    
});

export = router;
