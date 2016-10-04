import * as express from 'express';
import { defaultPartials } from './partials';

var router = express.Router();

router.get('/', (req: express.Request, response: express.Response) => {
    response.render(
        'browser',
        {
            user: (<any>req).user,
            partials: defaultPartials
        });
});

export = router;