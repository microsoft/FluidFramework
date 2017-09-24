import * as git from "gitresources";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as redis from "redis";
import * as util from "util";
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
    public webServerFactory: services.WebServerFactory;

    constructor(
        public config: Provider,
        public producer: utils.kafkaProducer.IProducer,
        public pub: redis.RedisClient,
        public sub: redis.RedisClient,
        public historian: git.IHistorian,
        public mongoManager: utils.MongoManager,
        public port: any,
        public documentsCollectionName: string) {

        this.webServerFactory = new services.WebServerFactory(this.pub, this.sub);
    }

    public async dispose(): Promise<void> {
        const producerClosedP = this.producer.close();
        const pubClosedP = util.promisify(((callback) => this.pub.quit(callback)) as Function)();
        const subClosedP = util.promisify(((callback) => this.sub.quit(callback)) as Function)();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, pubClosedP, subClosedP, mongoClosedP]);
    }
}

export class AlfredResourcesFactory implements utils.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        // Producer used to publish messages
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const kafkaClientId = config.get("alfred:kafkaClientId");
        const topic = config.get("alfred:topic");
        const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, topic);

        // Setup Redis endpoints
        const redisConfig = config.get("redis");
        let options: any = { auth_pass: redisConfig.pass };
        if (config.get("redis:tls")) {
            options.tls = {
                servername: redisConfig.host,
            };
        }

        let pubOptions = _.clone(options);
        let subOptions = _.clone(options);

        let pub = redis.createClient(redisConfig.port, redisConfig.host, pubOptions);
        let sub = redis.createClient(redisConfig.port, redisConfig.host, subOptions);

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);
        const documentsCollectionName = config.get("mongo:collectionNames:documents");

        // Historian for document storage
        const settings = config.get("git");
        const historian: git.IHistorian = new clientServices.Historian(settings.historian);

        let port = normalizePort(process.env.PORT || "3000");

        return new AlfredResources(config, producer, pub, sub, historian, mongoManager, port, documentsCollectionName);
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
            resources.documentsCollectionName);
    }
}
