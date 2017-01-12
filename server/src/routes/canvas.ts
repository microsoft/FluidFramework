import * as express from 'express';
import { defaultPartials } from './partials';

var router = express.Router();

router.get('/:id', (req: express.Request, response: express.Response) => {
    let sync = req.query['sync'] || true;    
    response.render(
        'canvas',
        {
            partials: defaultPartials,
            id: `Canvas - ${req.params['id']}`,
        });
});

export = router;