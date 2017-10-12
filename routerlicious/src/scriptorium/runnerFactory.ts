import { Provider } from "nconf";
import * as core from "../core";
import * as services from "../services";
import * as utils from "../utils";
import { ScriptoriumRunner } from "./runner";

export class ScriptoriumResources implements utils.IResources {
    constructor(
        public consumer: utils.kafkaConsumer.IConsumer,
        public collection: core.ICollection<any>,
        public mongoManager: utils.MongoManager,
        public io: services.SocketIoRedisPublisher,
        public groupId: string,
        public topic: string,
        public checkpointBatchSize: number,
        public checkpointTimeIntervalMsec: number,
        public metricClientConfig: any) {
    }

    public async dispose(): Promise<void> {
        const consumerClosedP = this.consumer.close();
        const mongoClosedP = this.mongoManager.close();
        const publisherP = this.io.close();
        await Promise.all([consumerClosedP, mongoClosedP, publisherP]);
    }
}

export class ScriptoriumResourcesFactory implements utils.IResourcesFactory<ScriptoriumResources> {
    public async create(config: Provider): Promise<ScriptoriumResources> {
        let redisConfig = config.get("redis");
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const topic = config.get("scriptorium:topic");
        const groupId = config.get("scriptorium:groupId");
        const checkpointBatchSize = config.get("scriptorium:checkpointBatchSize");
        const checkpointTimeIntervalMsec = config.get("scriptorium:checkpointTimeIntervalMsec");
        const mongoUrl = config.get("mongo:endpoint") as string;
        const deltasCollectionName = config.get("mongo:collectionNames:deltas");
        const metricClientConfig = config.get("metric");

        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory, false);
        const db = await mongoManager.getDatabase();
        const collection = db.collection(deltasCollectionName);
        await collection.createIndex({
                "documentId": 1,
                "operation.sequenceNumber": 1,
            },
            true);

        const publisher = new services.SocketIoRedisPublisher(redisConfig.port, redisConfig.host);

        const consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic, false);

        return new ScriptoriumResources(
            consumer,
            collection,
            mongoManager,
            publisher,
            groupId,
            topic,
            checkpointBatchSize,
            checkpointTimeIntervalMsec,
            metricClientConfig);
    }
}

export class ScriptoriumRunnerFactory implements utils.IRunnerFactory<ScriptoriumResources> {
    public async create(resources: ScriptoriumResources): Promise<utils.IRunner> {
        return new ScriptoriumRunner(
            resources.consumer,
            resources.collection,
            resources.io,
            resources.groupId,
            resources.topic,
            resources.checkpointBatchSize,
            resources.checkpointTimeIntervalMsec,
            resources.metricClientConfig);
    }
}
