/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureFunction, Context as AzContext } from "@azure/functions";
import { DeliLambdaFactory } from "@prague/lambdas";
import { create as createDocumentRouter } from "@prague/lambdas-driver";
import * as services from "@prague/services";
import * as core from "@prague/services-core";
import { Provider } from "nconf";
import { Context, processAll, settings } from "../common";
import { IPartitionLambda } from "@prague/services-core";

async function deliCreate(config: Provider): Promise<core.IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new core.MongoManager(mongoFactory, false);
    lastContext.log("mongoManager.getDatabase()");
    const client = await mongoManager.getDatabase();
    lastContext.log("mongoManager.client.collection()");
    const collection = await client.collection<core.IDocument>(documentsCollectionName);
    lastContext.log("ehCreate");

    const endpoint = config.get("eventHub:endpoint");
    const forwardProducer = new services.EventHubProducer(endpoint, forwardSendTopic);
    const reverseProducer = new services.EventHubProducer(endpoint, reverseSendTopic);

    return new DeliLambdaFactory(mongoManager, collection, forwardProducer, reverseProducer);
}

async function create(config: Provider): Promise<core.IPartitionLambdaFactory> {
    // nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}

let lookup = new Map<string, { lambda: IPartitionLambda, context: Context }>();
let lastContext: AzContext;

const lambda: AzureFunction = async (context, eventHubMessages) => {
    lastContext = context;
    const config = (new Provider({})).defaults(settings).use("memory");

    context.log("Hello!");

    const partitionContext = context.bindingData.partitionContext;
    const partitionId = partitionContext.runtimeInformation.partitionId;

    if (!lookup.has(partitionId)) {
        context.log(`Can't find ${partitionId}`);
        const pragueContext = new Context(context);
        context.log(`Creating deli factory`);
        const deli = await create(config);
        context.log(`Creating partition`);
        const newLambda = await deli.create(config, pragueContext);
        context.log(`Ready to do stuff`);
        lookup.set(partitionId, { lambda: newLambda, context: pragueContext });
    } else {
        context.log(`Active and reusing!`);    
        lookup.get(partitionId).context.updateContext(context);
    }

    const deliLambda = lookup.get(partitionId).lambda;
    let pragueContext = lookup.get(partitionId).context;

    const sequenceNumberArray = context.bindingData.sequenceNumberArray;
    const target = sequenceNumberArray
        ? sequenceNumberArray[sequenceNumberArray.length - 1]
        : 0;
    context.log(`target = ${target}`);
    
    context.log(`JavaScript eventhub trigger function called for message array`);
    processAll(eventHubMessages, context, deliLambda);
    await pragueContext.wait(target);
    context.log(`Done`);
};

export = lambda;
