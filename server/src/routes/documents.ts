import * as express from 'express';
import * as documents from '../db/documents';

var router = express.Router();

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