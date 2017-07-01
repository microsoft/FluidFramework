// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { MongoClient } from "mongodb";
import * as api from "../api";

// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));

// Loads a document from DB.
export class DocumentLoader {

    constructor(private id: string, private services: api.ICollaborationServices) {
    }

    public async load(): Promise<api.ICollaborativeObject> {

        // Load the mongodb collection
        const collection = await objectsCollectionP;

        const dbObject = await collection.findOne({ _id: this.id });

        const extension = api.defaultRegistry.getExtension(dbObject.type);
        const sharedObject = extension.load(this.id, this.services, api.defaultRegistry);

        return sharedObject;
    }

}
