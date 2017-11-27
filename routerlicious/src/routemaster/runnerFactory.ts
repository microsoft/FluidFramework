import { Provider } from "nconf";
import * as core from "../core";
import * as services from "../services";
import * as utils from "../utils";
import { RouteMasterRunner } from "./runner";

export class RouteMasterResources implements utils.IResources {
    constructor(
        public producer: utils.kafkaProducer.IProducer,
        public consumer: utils.kafkaConsumer.IConsumer,
        public mongoManager: utils.MongoManager,
        public collection: core.ICollection<any>,
        public deltas: core.ICollection<any>,
        public groupId: string,
        public receiveTopic: string,
        public checkpointBatchSize: number,
        public checkpointTimeIntervalMsec: number) {
    }

    public async dispose(): Promise<void> {
        const consumerClosedP = this.consumer.close();
        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([consumerClosedP, producerClosedP, mongoClosedP]);
    }
}

export class RouteMasterResourcesFactory implements utils.IResourcesFactory<RouteMasterResources> {
    public async create(config: Provider): Promise<RouteMasterResources> {
        const mongoUrl = config.get("mongo:endpoint") as string;
        const documentsCollectionName = config.get("mongo:collectionNames:documents");
        const deltasCollectionName = config.get("mongo:collectionNames:deltas");

        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");

        const kafkaClientId = config.get("routemaster:clientId");
        const groupId = config.get("routemaster:groupId");

        const receiveTopic = config.get("routemaster:topics:receive");
        const sendTopic = config.get("routemaster:topics:send");
        const checkpointBatchSize = config.get("routemaster:checkpointBatchSize");
        const checkpointTimeIntervalMsec = config.get("routemaster:checkpointTimeIntervalMsec");

        // Connection to stored document details
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory, false);
        const client = await mongoManager.getDatabase();
        const collection = await client.collection(documentsCollectionName);
        const deltas = await client.collection(deltasCollectionName);

        // Prep Kafka producer and consumer
        let producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);
        let consumer = utils.kafkaConsumer.create(
            kafkaLibrary,
            kafkaEndpoint,
            kafkaClientId,
            groupId,
            receiveTopic,
            false);

        return new RouteMasterResources(
            producer,
            consumer,
            mongoManager,
            collection,
            deltas,
            groupId,
            receiveTopic,
            checkpointBatchSize,
            checkpointTimeIntervalMsec);
    }
}

export class RouteMasterRunnerFactory implements utils.IRunnerFactory<RouteMasterResources> {
    public async create(resources: RouteMasterResources): Promise<utils.IRunner> {
        return new RouteMasterRunner(
            resources.producer,
            resources.consumer,
            resources.collection,
            resources.deltas,
            resources.checkpointBatchSize,
            resources.checkpointTimeIntervalMsec);
    }
}
