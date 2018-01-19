import * as _ from "lodash";
import { Provider } from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as util from "util";
import * as utils from "../utils";
import { createUploader } from "./agentUploader";
import { IAgentUploader } from "./messages";
import { TmzRunner } from "./runner";

export class TmzResources implements utils.IResources {
    constructor(
        public io: any,
        public alfredUrl: string,
        public pub: redis.RedisClient,
        public sub: redis.RedisClient,
        public port: any,
        public consumer: utils.kafkaConsumer.IConsumer,
        public uploader: IAgentUploader,
        public schedulerType: string,
        public onlyServer: boolean,
        public checkerTimeout: number,
        public tasks: any) {
    }

    public async dispose(): Promise<void> {
        const consumerClosedP = this.consumer.close();
        const socketIoP = util.promisify(((callback) => this.io.close(callback)) as Function)();
        const pubP = util.promisify(((callback) => this.pub.quit(callback)) as Function)();
        const subP = util.promisify(((callback) => this.sub.quit(callback)) as Function)();
        await Promise.all([consumerClosedP, socketIoP, pubP, subP]);
    }
}

export class TmzResourcesFactory implements utils.IResourcesFactory<TmzResources> {
    public async create(config: Provider): Promise<TmzResources> {
        // Setup Kafka connection
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const topic = config.get("tmz:topic");
        const groupId = config.get("tmz:groupId");
        const minioConfig = config.get("minio");
        const alfredUrl = config.get("tmz:alfred");

        // Setup redis for socketio
        let io = socketIo();

        let host = config.get("redis:host");
        let redisPort = config.get("redis:port");
        let pass = config.get("redis:pass");

        let options: any = { auth_pass: pass };
        if (config.get("redis:tls")) {
            options.tls = {
                servername: host,
            };
        }

        let pubOptions = _.clone(options);
        let subOptions = _.clone(options);

        let pub = redis.createClient(redisPort, host, pubOptions);
        let sub = redis.createClient(redisPort, host, subOptions);
        io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

        // setup state manager and work manager.
        let port = config.get("tmz:port");
        const checkerTimeout = config.get("tmz:timeoutMSec:checker");
        const schedulerType = config.get("tmz:workerType");
        const onlyServer = config.get("tmz:onlyServer");
        const tasks = config.get("tmz:tasks");

        let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, groupId, topic, true);
        let uploader = createUploader("minio", minioConfig);

        // tslint:disable-next-line
        return new TmzResources(io, alfredUrl, pub, sub, port, consumer, uploader, schedulerType, onlyServer, checkerTimeout, tasks);
    }
}

export class TmzRunnerFactory implements utils.IRunnerFactory<TmzResources> {
    public async create(resources: TmzResources): Promise<utils.IRunner> {
        return new TmzRunner(
            resources.io,
            resources.alfredUrl,
            resources.port,
            resources.consumer,
            resources.uploader,
            resources.schedulerType,
            resources.onlyServer,
            resources.checkerTimeout,
            resources.tasks);
    }
}
