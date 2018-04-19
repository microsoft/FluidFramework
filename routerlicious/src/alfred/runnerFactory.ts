import { Provider } from "nconf";
import { ITenantManager } from "../api-core";
import * as core from "../core";
import * as services from "../services";
import * as utils from "../utils";
import { AlfredRunner } from "./runner";

export class AlfredResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: utils.kafkaProducer.IProducer,
        public redisConfig: any,
        public webSocketLibrary: string,
        public tenantManager: ITenantManager,
        public mongoManager: utils.MongoManager,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any,
        public authEndpoint: string) {

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
        const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, topic);
        const redisConfig = config.get("redis");
        const webSocketLibrary = config.get("alfred:webSocketLib");
        const authEndpoint = config.get("auth:endpoint");

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);
        const documentsCollectionName = config.get("mongo:collectionNames:documents");
        const tenantsCollectionName = config.get("mongo:collectionNames:tenants");
        const tenantConfig = config.get("tenantConfig");

        // Tenant configuration
        const tenantManager = await services.TenantManager.Load(mongoManager, tenantConfig, tenantsCollectionName);

        // This wanst to create stuff
        let port = utils.normalizePort(process.env.PORT || "3000");

        return new AlfredResources(
            config,
            producer,
            redisConfig,
            webSocketLibrary,
            tenantManager,
            mongoManager,
            port,
            documentsCollectionName,
            metricClientConfig,
            authEndpoint);
    }
}

export class AlfredRunnerFactory implements utils.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<utils.IRunner> {
        return new AlfredRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.tenantManager,
            resources.mongoManager,
            resources.producer,
            resources.documentsCollectionName,
            resources.metricClientConfig,
            resources.authEndpoint);
    }
}
