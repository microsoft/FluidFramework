import { IAlfredTenant } from "@prague/routerlicious/dist/alfred/tenant";
import * as core from "@prague/routerlicious/dist/core";
import * as services from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import { RdkafkaProducer } from "../rdkafka";
import { KafkaOrdererFactory } from "./kafkaOrderer";
import { OrdererManager } from "./orderFactory";
import { JarvisRunner } from "./runner";

export class JarvisResources implements utils.IResources {
    constructor(
        public config: Provider,
        public producer: utils.IProducer,
        public redisConfig: any,
        public webSocketLibrary: string,
        public orderManager: OrdererManager,
        public tenantManager: core.ITenantManager,
        public storage: core.IDocumentStorage,
        public appTenants: IAlfredTenant[],
        public mongoManager: utils.MongoManager,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any) {
    }

    public async dispose(): Promise<void> {
        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}

export class JarvisResourcesFactory implements utils.IResourcesFactory<JarvisResources> {
    public async create(config: Provider): Promise<JarvisResources> {
        // Producer used to publish messages
        const kafkaEndpoint = config.get("kafka:endpoint");
        const topic = config.get("alfred:topic");
        const metricClientConfig = config.get("metric");

        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));
        const producer = new RdkafkaProducer(kafkaEndpoint, topic);
        const redisConfig = config.get("redis");
        const webSocketLibrary = config.get("alfred:webSocketLib");
        const authEndpoint = config.get("auth:endpoint");

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);
        const documentsCollectionName = config.get("mongo:collectionNames:documents");

        // create the index on the documents collection
        const db = await mongoManager.getDatabase();
        const documentsCollection = db.collection<core.IDocument>(documentsCollectionName);
        await documentsCollection.createIndex(
            {
                documentId: 1,
                tenantId: 1,
            },
            true);
        const deltasCollectionName = config.get("mongo:collectionNames:deltas");

        // tmz agent uploader does not run locally.
        // TODO: Make agent uploader run locally.
        const tmzConfig = config.get("tmz");
        const taskMessageSender = services.createMessageSender(config.get("rabbitmq"), tmzConfig);
        await taskMessageSender.initialize();

        const nodeCollectionName = config.get("mongo:collectionNames:nodes");
        // this.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));

        const tenantManager = new services.TenantManager(authEndpoint, config.get("worker:blobStorageUrl"));

        const databaseManager = new utils.MongoDatabaseManager(
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName);

        const storage = new services.DocumentStorage(databaseManager, tenantManager, producer);

        const kafkaOrdererFactory = new KafkaOrdererFactory(producer, storage, maxSendMessageSize);

        const ordererManager = new OrdererManager(kafkaOrdererFactory);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("alfred:tenants") as Array<{ id: string, key: string }>;

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        return new JarvisResources(
            config,
            producer,
            redisConfig,
            webSocketLibrary,
            ordererManager,
            tenantManager,
            storage,
            appTenants,
            mongoManager,
            port,
            documentsCollectionName,
            metricClientConfig);
    }
}

export class JarvisRunnerFactory implements utils.IRunnerFactory<JarvisResources> {
    public async create(resources: JarvisResources): Promise<utils.IRunner> {
        return new JarvisRunner(
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.storage,
            resources.appTenants,
            resources.mongoManager,
            resources.producer);
    }
}
