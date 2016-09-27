import * as express from 'express';
import * as passport from 'passport';
import * as authOptions from './authOptions';
import * as accounts from '../accounts';
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

var router = express.Router();

// TODO these all probably should be POST calls - but simpler in the UI for now to leave as GETs

router.get('/google', ensureLoggedIn(), passport.authorize('google', authOptions.google));

router.get('/microsoft', ensureLoggedIn(), passport.authorize('openidconnect', authOptions.microsoft))
  
router.get('/remove/:id', ensureLoggedIn(), (request, response) => {
    let id = request.params.id;
    
    // TODO on error return some kind of error message, etc... and/or turn this into AJAX calls
    accounts.unlinkAccount(request.user, id).then(
        () => response.redirect('/profile'),
        (error) => response.redirect('/profile'));    
});

export = router;