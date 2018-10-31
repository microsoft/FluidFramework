import { IAlfredTenant } from "@prague/routerlicious/dist/alfred/tenant";
import * as core from "@prague/routerlicious/dist/core";
import * as services from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import * as os from "os";
import { RdkafkaProducer } from "../rdkafka";
import { JarvisRunner } from "./runner";

export class JarvisResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: utils.IProducer,
        public redisConfig: any,
        public webSocketLibrary: string,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public storage: core.IDocumentStorage,
        public appTenants: IAlfredTenant[],
        public mongoManager: utils.MongoManager,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any) {

        this.webServerFactory = new services.SocketIoWebServerFactory(this.redisConfig);
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
        const nodeManager = new services.NodeManager(mongoManager, nodeCollectionName);
        // this.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
        const reservationManager = new services.ReservationManager(
            nodeManager,
            mongoManager,
            config.get("mongo:collectionNames:reservations"));

        const tenantManager = new services.TenantManager(authEndpoint, config.get("worker:blobStorageUrl"));

        const databaseManager = new utils.MongoDatabaseManager(
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName);

        const storage = new services.DocumentStorage(databaseManager, tenantManager, producer);

        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));

        const address = `${await utils.getHostIp()}:4000`;
        const nodeFactory = new services.LocalNodeFactory(
            os.hostname(),
            address,
            storage,
            databaseManager,
            60000,
            taskMessageSender,
            tenantManager,
            tmzConfig.permissions,
            maxSendMessageSize);
        const localOrderManager = new services.LocalOrderManager(nodeFactory, reservationManager);
        const kafkaOrdererFactory = new services.KafkaOrdererFactory(producer, storage, maxSendMessageSize);
        const orderManager = new services.OrdererManager(localOrderManager, kafkaOrdererFactory);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("alfred:tenants") as Array<{ id: string, key: string }>;

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        return new JarvisResources(
            config,
            producer,
            redisConfig,
            webSocketLibrary,
            orderManager,
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
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.storage,
            resources.appTenants,
            resources.mongoManager,
            resources.producer,
            resources.metricClientConfig);
    }
}
