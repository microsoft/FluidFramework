import * as express from 'express';

// import * as storage from 'azure-storage';
var nconf = require('nconf');
var storage = require('azure-storage');
var promisify = require('es6-promisify');

// Create access to blob storage
var connectionInfo = nconf.get('blob');
var blobService = storage.createBlobService(connectionInfo.name, connectionInfo.key);

var router = express.Router();

// Create promise specific versions of storage commands
var getBlobToText = promisify(blobService.getBlobToText, blobService);

router.get('/:id', (request: express.Request, response: express.Response, next: express.NextFunction) => {
    var id = request.params['id'];
    var textP = getBlobToText('knowledge', id)
    
    textP.then(
        (result) => {
            response.json(JSON.parse(result));
        },
        (error) => {
            response.status(400).json(error);
        });
});

export = router;