import * as services from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import { Provider } from "nconf";
import * as redis from "redis";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { ScriptoriumLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const redisConfig = config.get("redis");
    const publisher = redis.createClient(redisConfig.port, redisConfig.host);

    const mongoUrl = config.get("mongo:endpoint") as string;
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);

    const db = await mongoManager.getDatabase();
    const collection = db.collection(deltasCollectionName);
    await collection.createIndex(
        {
            "documentId": 1,
            "operation.sequenceNumber": 1,
            "tenantId": 1,
        },
        true);

    return new ScriptoriumLambdaFactory(mongoManager, collection, publisher);
}
