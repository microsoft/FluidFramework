import * as express from 'express';
import { defaultPartials } from './partials';

var router = express.Router();

router.get('/', (req: express.Request, response: express.Response) => {
    response.render(
        'collab',
        {
            partials: defaultPartials
        });
});

export = router;