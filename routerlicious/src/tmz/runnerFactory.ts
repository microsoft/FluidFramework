import * as _ from "lodash";
import { Provider } from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as util from "util";
import * as utils from "../utils";
import { TmzRunner } from "./runner";

export class TmzResources implements utils.IResources {
    constructor(
        public io: any,
        public pub: redis.RedisClient,
        public sub: redis.RedisClient,
        public port: any,
        public consumer: utils.kafkaConsumer.IConsumer,
        public schedulerType: string,
        public onlyServer: boolean,
        public checkerTimeout: number) {
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

        let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic, true);

        return new TmzResources(io, pub, sub, port, consumer, schedulerType, onlyServer, checkerTimeout);
    }
}

export class TmzRunnerFactory implements utils.IRunnerFactory<TmzResources> {
    public async create(resources: TmzResources): Promise<utils.IRunner> {
        return new TmzRunner(
            resources.io,
            resources.port,
            resources.consumer,
            resources.schedulerType,
            resources.onlyServer,
            resources.checkerTimeout);
    }
}
