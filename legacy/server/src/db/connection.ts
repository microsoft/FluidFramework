import * as documentdb from "documentdb";
import { Promise } from "es6-promise";
import * as promisify from "es6-promisify";
import * as nconf from "nconf";

// DB connection information
const databaseName = "pronet";
const databaseUrl = `dbs/${databaseName}`;

// Connect to DocumentDB
let connectionString = nconf.get("documentDB");
let client = new documentdb.DocumentClient(connectionString.endpoint, { masterKey: connectionString.key });

// Convert from node style callbacks to es6 promises
let createDatabase = promisify(client.createDatabase, client);
let createCollection = promisify(client.createCollection, client);
let createDocument = promisify(client.createDocument, client);
let replaceDocument = promisify(client.replaceDocument, client);
let deleteDocument = promisify(client.deleteDocument, client);

// The typings file needs an update to handle the below cases
let readDatabase = promisify((<any> client).readDatabase, client);
let readCollection = promisify((<any> client).readCollection, client);
let readDocument = promisify((<any> client).readDocument, client);

function getCollectionUrl(collection: string): string {
    return `${databaseUrl}/colls/${collection}`;
}

function getDocumentUrl(collection: string, documentId: string): string {
    return `${getCollectionUrl(collection)}/docs/${documentId}`;
}

// Get or create the underlying database in DocumentDB
let databaseP = (<Promise<documentdb.DatabaseMeta>> readDatabase(databaseUrl)).catch((error) => {
    if (error.code === 404) {
        return createDatabase({ id: databaseName });
    } else {
        throw error;
    }
});

/**
 * Gets or creates the collection with the given name
 */
export function getOrCreateCollection<T>(collection: string): Collection<T> {
    let collectionUrl = getCollectionUrl(collection);

    let collectionP = databaseP.then(() => {
        return readCollection(collectionUrl).catch((error) => {
            if (error.code === 404) {
                return createCollection(databaseUrl, { id: collection }, { offerThroughput: 400 });
            } else {
                throw error;
            }
        });
    });

    return new Collection<T>(collection, collectionP);
}

/**
 * Wrapper class to manage access to a DocumentDB collection
 */
class Collection<T> {
    constructor(public name: string, private collectionP: Promise<any>) {
    }

    public read(documentId: string): Promise<T> {
        let documentUrl = getDocumentUrl(this.name, documentId);
        return this.collectionP.then(() => {
            return readDocument(documentUrl).catch((error) => {
                console.error(JSON.stringify(error, null, 2));
                if (error.code === 404) {
                    // We will just return null for documents that don"t exist but will not treat this as an error
                    return null;
                } else {
                    throw error;
                }
            });
        });
    }

    public create(document: T, disableAutomaticIdGeneration = true): Promise<T> {
        let collectionUrl = getCollectionUrl(this.name);

        return this.collectionP.then(() => {
            return createDocument(
                collectionUrl,
                document,
                { disableAutomaticIdGeneration });
        });
    }

    // TODO create some base IDocument so we know T has an id field
    public replace(document: any): Promise<T> {
        let documentUrl = getDocumentUrl(this.name, document.id);

        return this.collectionP.then(() => {
            return replaceDocument(documentUrl, document);
        });
    }

    public delete(id: string): Promise<any> {
        let documentUrl = getDocumentUrl(this.name, id);

        return this.collectionP.then(() => {
            return deleteDocument(documentUrl);
        });
    }

    public query(query: string, parameters: documentdb.SqlParameter[]): Promise<T[]> {
        let collectionUrl = getCollectionUrl(this.name);

        return this.collectionP.then(() => {
            let queryIterator = client.queryDocuments(collectionUrl, { query, parameters });
            let getResults = promisify(queryIterator.toArray, queryIterator);
            return getResults();
        });
    }

    public getAll(): Promise<T[]> {
        let collectionUrl = getCollectionUrl(this.name);

        return this.collectionP.then(() => {
            let queryIterator = (<any> client).readDocuments(collectionUrl);
            let readDocuments = promisify(queryIterator.toArray, queryIterator);
            return readDocuments();
        });
    }
}
