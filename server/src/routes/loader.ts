import * as express from 'express';
import { defaultPartials } from './partials';
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;

var router = express.Router();

router.get('/', ensureLoggedIn(), (req: express.Request, response: express.Response) => {
    response.render(
        'loader',
        {
            user: (<any>req).user,
            partials: defaultPartials
        });
});

export = router;