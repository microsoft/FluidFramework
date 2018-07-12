import { Provider } from "nconf";
import * as os from "os";
import * as core from "../core";
import * as services from "../services";
import { TmzResourcesFactory, TmzRunnerFactory } from "../tmz/runnerFactory";
import * as utils from "../utils";
import { AlfredRunner } from "./runner";
import { IAlfredTenant } from "./tenant";

export class AlfredResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: utils.IProducer,
        public redisConfig: any,
        public webSocketLibrary: string,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
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

export class AlfredResourcesFactory implements utils.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        // Producer used to publish messages
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const kafkaClientId = config.get("alfred:kafkaClientId");
        const topic = config.get("alfred:topic");
        const metricClientConfig = config.get("metric");
        const producer = utils.createProducer(kafkaLibrary, kafkaEndpoint, kafkaClientId, topic);
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

        // TODO should fold this into the lambda itself
        // TMZ resources
        const resourceFactory = new TmzResourcesFactory();
        const runnerFactory = new TmzRunnerFactory();
        const resources = await resourceFactory.create(config);
        const runner = await runnerFactory.create(resources);
        runner.start();

        const nodeCollectionName = config.get("mongo:collectionNames:nodes");
        const nodeManager = new services.NodeManager(mongoManager, nodeCollectionName);
        // this.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
        const reservationManager = new services.ReservationManager(
            nodeManager,
            mongoManager,
            config.get("mongo:collectionNames:reservations"));

        const tenantManager = new services.TenantManager(authEndpoint, config.get("worker:blobStorageUrl"));
        const address = `${await utils.getHostIp()}:4000`;
        const nodeFactory = new services.LocalNodeFactory(
            os.hostname(),
            address,
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            runner,
            60000);
        const localOrderManager = new services.LocalOrderManager(nodeFactory, reservationManager);
        const kafkaOrderer = new utils.KafkaOrderer(producer);
        const orderManager = new services.OrdererManager(localOrderManager, kafkaOrderer);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("alfred:tenants") as Array<{ id: string, key: string }>;

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        return new AlfredResources(
            config,
            producer,
            redisConfig,
            webSocketLibrary,
            orderManager,
            tenantManager,
            appTenants,
            mongoManager,
            port,
            documentsCollectionName,
            metricClientConfig);
    }
}

export class AlfredRunnerFactory implements utils.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<utils.IRunner> {
        return new AlfredRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.appTenants,
            resources.mongoManager,
            resources.producer,
            resources.documentsCollectionName,
            resources.metricClientConfig);
    }
}
