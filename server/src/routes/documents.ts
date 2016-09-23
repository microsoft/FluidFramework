import * as documentdb from 'documentdb';
import * as express from 'express';
var nconf = require('nconf');
import { Promise } from 'es6-promise';
var promisify = require('es6-promisify');
import { ViewModel } from '../interfaces';

var router = express.Router();

// Connect to DocumentDB
var connectionString = nconf.get("documentDB");
var client = new documentdb.DocumentClient(connectionString.endpoint, { masterKey: connectionString.key });

const databaseName = 'pronet';
const collectionName = 'documents'
const databaseUrl = `dbs/${databaseName}`;
const collectionUrl = `${databaseUrl}/colls/${collectionName}`;

var readDatabase = promisify(client.readDatabase, client);
var createDatabase = promisify(client.createDatabase, client);
var readCollection = promisify(client.readCollection, client);
var createCollection = promisify(client.createCollection, client);
var readDocument = promisify(client.readDocument, client);

// Retrieves a promise to the created database
var databaseP = (<Promise<documentdb.DatabaseMeta>>readDatabase(databaseUrl)).catch((error) => {
    if (error.code === 404) {
        return createDatabase({ id: databaseName });
    }
    else {
        throw error;
    }
});

// Create the documents collection
var collectionP = databaseP.then((database) => {
    return readCollection(collectionUrl).catch((error) => {
        if (error.code === 404) {
            return createCollection(databaseUrl, { id: collectionName }, { offerThroughput: 400 });
        }
        else {
            throw error;
        }
    });
});

collectionP.then(
    (collection) => {
        console.log(JSON.stringify(collection));
    },
    (error) => {        
        console.error("error");
        console.error(JSON.stringify(error));
    });

router.get('/:id', (request: express.Request, response: express.Response) => {
    var documentUrl = `${collectionUrl}/docs/${request.params['id']}`;
    var documentP = collectionP.then((collection) => {
        return readDocument(documentUrl);
    });

    documentP.then(
        (document) => {            
            response.json(document);            
        },
        (error) => {
            response.status(400).json(error);
        })
});

export = router;