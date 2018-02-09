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
        public io: SocketIO.Server,
        public alfredUrl: string,
        public pub: redis.RedisClient,
        public sub: redis.RedisClient,
        public port: any,
        public uploader: IAgentUploader,
        public schedulerType: string,
        public onlyServer: boolean,
        public checkerTimeout: number,
        public tasks: any) {
    }

    public async dispose(): Promise<void> {
        const socketIoP = util.promisify(((callback) => this.io.close(callback)) as Function)();
        const pubP = util.promisify(((callback) => this.pub.quit(callback)) as Function)();
        const subP = util.promisify(((callback) => this.sub.quit(callback)) as Function)();
        await Promise.all([socketIoP, pubP, subP]);
    }
}

export class TmzResourcesFactory implements utils.IResourcesFactory<TmzResources> {
    public async create(config: Provider): Promise<TmzResources> {
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

        let uploader = createUploader("minio", minioConfig);

        // tslint:disable-next-line
        return new TmzResources(io, alfredUrl, pub, sub, port, uploader, schedulerType, onlyServer, checkerTimeout, tasks);
    }
}

export class TmzRunnerFactory implements utils.IRunnerFactory<TmzResources> {
    public async create(resources: TmzResources): Promise<TmzRunner> {
        return new TmzRunner(
            resources.io,
            resources.alfredUrl,
            resources.port,
            resources.uploader,
            resources.schedulerType,
            resources.onlyServer,
            resources.checkerTimeout,
            resources.tasks);
    }
}
