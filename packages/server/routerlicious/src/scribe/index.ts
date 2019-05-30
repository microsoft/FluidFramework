import { ScribeLambdaFactory } from "@prague/lambdas";
import { create as createDocumentRouter } from "@prague/lambdas-driver";
import { MongoDbFactory } from "@prague/services";
import { IDocument, IPartitionLambdaFactory, MongoManager } from "@prague/services-core";
import { Provider } from "nconf";

export async function scribeCreate(config: Provider): Promise<IPartitionLambdaFactory> {
    // Access config values
    const mongoUrl = config.get("mongo:endpoint") as string;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const historianUrl = config.get("worker:blobStorageUrl") as string;

    // Access Mongo storage for pending summaries
    const mongoFactory = new MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection<IDocument>(documentsCollectionName);
    await collection.createIndex(
        {
            documentId: 1,
            sequenceNumber: 1,
            tenantId: 1,
        },
        true);

    return new ScribeLambdaFactory(mongoManager, collection, historianUrl);
}

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: scribeCreate });
    return createDocumentRouter(config);
}
