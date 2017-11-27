import { Provider } from "nconf";
import * as core from "../core";
import * as services from "../services";
import * as utils from "../utils";
import { DeliRunner } from "./runner";

export class DeliResources implements utils.IResources {
    constructor(
        public producer: utils.kafkaProducer.IProducer,
        public consumer: utils.kafkaConsumer.IConsumer,
        public mongoManager: utils.MongoManager,
        public collection: core.ICollection<any>,
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

export class DeliResourcesFactory implements utils.IResourcesFactory<DeliResources> {
    public async create(config: Provider): Promise<DeliResources> {
        const mongoUrl = config.get("mongo:endpoint") as string;
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const kafkaClientId = config.get("deli:kafkaClientId");
        const receiveTopic = config.get("deli:topics:receive");
        const sendTopic = config.get("deli:topics:send");
        const checkpointBatchSize = config.get("deli:checkpointBatchSize");
        const checkpointTimeIntervalMsec = config.get("deli:checkpointTimeIntervalMsec");
        const documentsCollectionName = config.get("mongo:collectionNames:documents");
        const groupId = config.get("deli:groupId");

        // Connection to stored document details
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory, false);
        const client = await mongoManager.getDatabase();
        const collection = await client.collection(documentsCollectionName);

        // Prep Kafka producer and consumer
        let producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);
        let consumer = utils.kafkaConsumer.create(
            kafkaLibrary,
            kafkaEndpoint,
            kafkaClientId,
            groupId,
            receiveTopic,
            false);

        return new DeliResources(
            producer,
            consumer,
            mongoManager,
            collection,
            groupId,
            receiveTopic,
            checkpointBatchSize,
            checkpointTimeIntervalMsec);
    }
}

export class DeliRunnerFactory implements utils.IRunnerFactory<DeliResources> {
    public async create(resources: DeliResources): Promise<utils.IRunner> {
        return new DeliRunner(
            resources.producer,
            resources.consumer,
            resources.collection,
            resources.checkpointBatchSize,
            resources.checkpointTimeIntervalMsec);
    }
}
