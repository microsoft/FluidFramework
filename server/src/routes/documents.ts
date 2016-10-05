import * as express from 'express';
import * as documents from '../db/documents';
import { defaultPartials } from './partials';

var router = express.Router();

router.get('/views/chart', (request: express.Request, response: express.Response) => {
    response.render(
        'documents/views/chart',
        {
            partials: defaultPartials
        });
});

router.get('/:id', (request: express.Request, response: express.Response) => {
    var documentId = request.params['id'];
    var documentP = documents.read(documentId);

    documentP.then(
        (document) => {
            response.json(document);
        },
        (error) => {
            response.status(400).json(error);
        })
});

export = router;