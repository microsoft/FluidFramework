import * as express from 'express';
import { defaultPartials } from './partials';

var router = express.Router();

router.get('/:id', (req: express.Request, response: express.Response) => {
    let sync = req.query['sync'] || true;    
    response.render(
        'collab',
        {
            partials: defaultPartials,
            id: req.params['id'],
            sync: sync
        });
});

export = router;