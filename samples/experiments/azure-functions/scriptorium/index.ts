import { AzureFunction } from "@azure/functions";
import { ScriptoriumLambdaFactory } from "@prague/lambdas";
import * as services from "@prague/services";
import { IPartitionLambdaFactory, MongoManager } from "@prague/services-core";
import { Provider } from "nconf";
import { Context, processAll, settings } from "../common";

async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);

    const db = await mongoManager.getDatabase();
    const opCollection = db.collection(deltasCollectionName);
    const contentCollection = db.collection("content");

    return new ScriptoriumLambdaFactory(mongoManager, opCollection, contentCollection);
}

const lambda: AzureFunction = async (context, eventHubMessages) => {
    const config = (new Provider({})).defaults(settings).use("memory");

    const pragueContext = new Context(context);

    const scriptorium = await create(config);
    const scriptoriumLambda = await scriptorium.create(config, pragueContext);

    const sequenceNumberArray = context.bindingData.sequenceNumberArray;
    const target = sequenceNumberArray
        ? sequenceNumberArray[sequenceNumberArray.length - 1]
        : 0;
    context.log(`target = ${target}`);

    context.log(`JavaScript eventhub trigger function called for message array`);
    processAll(eventHubMessages, context, scriptoriumLambda);
    await pragueContext.wait(target);
    context.log(`Done`);
};

export = lambda;