/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureFunction, Context as AzContext } from "@azure/functions";
import { ScriptoriumLambdaFactory } from "@prague/lambdas";
import * as services from "@prague/services";
import { IPartitionLambdaFactory, MongoManager, IPartitionLambda } from "@prague/services-core";
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
        const scriptorium = await create(config);
        context.log(`Creating partition`);
        const newLambda = await scriptorium.create(config, pragueContext);
        context.log(`Ready to do stuff`);
        lookup.set(partitionId, { lambda: newLambda, context: pragueContext });
    } else {
        context.log(`Active and reusing!`);    
        lookup.get(partitionId).context.updateContext(context);
    }

    const scriptoriumLambda = lookup.get(partitionId).lambda;
    const pragueContext = lookup.get(partitionId).context;

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