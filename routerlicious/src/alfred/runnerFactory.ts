import * as git from "gitresources";
import { Provider } from "nconf";
import * as core from "../core";
import * as services from "../services";
import * as clientServices from "../services-client";
import * as utils from "../utils";
import { AlfredRunner } from "./runner";

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    let normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // named pipe
        return val;
    }

    if (normalizedPort >= 0) {
        // port number
        return normalizedPort;
    }

    return false;
}

export class AlfredResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;
    public webServerFactory2: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: utils.kafkaProducer.IProducer,
        public redisConfig: any,
        public webSocketLibrary: string,
        public historian: git.IHistorian,
        public mongoManager: utils.MongoManager,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any,
        public authEndpoint: string) {

        // Remove (mdaumi): Call just one library.
        this.webServerFactory = webSocketLibrary === "socket.io"
            ? new services.SocketIoWebServerFactory(this.redisConfig)
            : new services.WsWebServerFactory();
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

        // Historian for document storage
        const settings = config.get("git");
        const historian: git.IHistorian = new clientServices.Historian(settings.historian);

        let port = normalizePort(process.env.PORT || "3000");

        return new AlfredResources(config, producer, redisConfig, webSocketLibrary, historian, mongoManager,
                                   port, documentsCollectionName, metricClientConfig, authEndpoint);
    }
}

export class AlfredRunnerFactory implements utils.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<utils.IRunner> {
        return new AlfredRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.historian,
            resources.mongoManager,
            resources.producer,
            resources.documentsCollectionName,
            resources.metricClientConfig,
            resources.authEndpoint);
    }
}
