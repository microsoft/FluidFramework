import * as documentdb from 'documentdb';
var nconf = require('nconf');
import { Promise } from 'es6-promise';
var promisify = require('es6-promisify');

// DB connection information
const databaseName = 'pronet';
const databaseUrl = `dbs/${databaseName}`;

// Connect to DocumentDB
let connectionString = nconf.get("documentDB");
let client = new documentdb.DocumentClient(connectionString.endpoint, { masterKey: connectionString.key });

// Convert from node style callbacks to es6 promises
let readDatabase = promisify(client.readDatabase, client);
let createDatabase = promisify(client.createDatabase, client);
let readCollection = promisify(client.readCollection, client);
let createCollection = promisify(client.createCollection, client);
let readDocument = promisify(client.readDocument, client);
let createDocument = promisify(client.createDocument, client);
let replaceDocument = promisify(client.replaceDocument, client);
let deleteDocument = promisify(client.deleteDocument, client);

function getCollectionUrl(collection: string): string {
    return `${databaseUrl}/colls/${collection}`;
}

function getDocumentUrl(collection: string, documentId: string): string {
    return `${getCollectionUrl(collection)}/docs/${documentId}`;
}

// Get or create the underlying database in DocumentDB
let databaseP = (<Promise<documentdb.DatabaseMeta>>readDatabase(databaseUrl)).catch((error) => {
    if (error.code === 404) {
        return createDatabase({ id: databaseName });
    }
    else {
        throw error;
    }
});

/**
 * Gets or creates the collection with the given name
 */
export function getOrCreateCollection<T>(collection: string): Collection<T> {
    let collectionUrl = getCollectionUrl(collection);

    var collectionP = databaseP.then(() => {
        return readCollection(collectionUrl).catch((error) => {
            if (error.code === 404) {
                return createCollection(databaseUrl, { id: collection }, { offerThroughput: 400 });
            }
            else {
                throw error;
            }
        })
    });

    return new Collection<T>(collection, collectionP);
}

/**
 * Wrapper class to manage access to a DocumentDB collection
 */
class Collection<T> {    
    constructor(public name: string, private _collectionP: Promise<any>) {        
    }

    read(documentId: string): Promise<T> {    
        let documentUrl = getDocumentUrl(this.name, documentId);
        return this._collectionP.then(() => {
            return readDocument(documentUrl).catch((error) => {
                console.error(JSON.stringify(error, null, 2));
                if (error.code === 404) {
                    // We will just return null for documents that don't exist but will not treat this as an error
                    return null;
                }
                else {
                    throw error;
                }
            })            
        });    
    }
    
    create(document: T): Promise<T> {
        let collectionUrl = getCollectionUrl(this.name);

        return this._collectionP.then(() => {
            return createDocument(collectionUrl, document, { disableAutomaticIdGeneration: true });
        });
    }

    // TODO create some base IDocument so we know T has an id field
    replace(document: any): Promise<T> {
        let documentUrl = getDocumentUrl(this.name, document.id);

        return this._collectionP.then(() => {
            return replaceDocument(documentUrl, document);
        });
    }

    delete(id: string): Promise<any> {
        let documentUrl = getDocumentUrl(this.name, id);

        return this._collectionP.then(() => {
            return deleteDocument(documentUrl);
        });
    }

    query(query: string, parameters: documentdb.SqlParameter[]): Promise<T[]> {
        let collectionUrl = getCollectionUrl(this.name);
                        
        return this._collectionP.then(() => {
            let queryIterator = client.queryDocuments(collectionUrl, { query: query, parameters: parameters })
            var getResults = promisify(queryIterator.toArray, queryIterator);
            return getResults();
        })
    }

    getAll(): Promise<T[]> {
        let collectionUrl = getCollectionUrl(this.name);

        return this._collectionP.then(() => {
            let queryIterator = client.readDocuments(collectionUrl);
            let readDocuments = promisify(queryIterator.toArray, queryIterator);
            return readDocuments();
        })
    }
}