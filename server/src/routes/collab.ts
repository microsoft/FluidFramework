import * as express from 'express';
import { defaultPartials } from './partials';

var router = express.Router();

router.get('/:id', (req: express.Request, response: express.Response) => {    
    response.render(
        'collab',
        {
            partials: defaultPartials,
            id: req.params['id']
        });
});

export = router;