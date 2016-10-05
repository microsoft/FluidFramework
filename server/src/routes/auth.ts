import * as express from 'express';
import * as passport from 'passport';
import * as authOptions from './authOptions';

var router = express.Router();

/* GET home page. */
router.get(
    '/google',
    passport.authenticate('google', authOptions.google));

router.get(
    '/microsoft',
    passport.authenticate('openidconnect', authOptions.microsoft));

router.get(
    '/facebook',
    passport.authenticate('facebook', authOptions.facebook));

router.get(
    '/linkedin',
    passport.authenticate('linkedin', authOptions.linkedin));

// the callback after google has authenticated the user
router.get(
    '/google/callback',
    passport.authenticate('google', {
        successRedirect: '/',
        failureRedirect: '/'
    }));

router.get(
    '/microsoft/callback',
    passport.authenticate('openidconnect', {
        successRedirect: '/',
        failureRedirect: '/'
    }));

router.get(
    '/facebook/callback',
    passport.authenticate('facebook', {
        successRedirect: '/',
        failureRedirect: '/'
    }));

router.get(
    '/linkedin/callback',
    passport.authenticate('linkedin', {
        successRedirect: '/',
        failureRedirect: '/'
    }));

export = router;