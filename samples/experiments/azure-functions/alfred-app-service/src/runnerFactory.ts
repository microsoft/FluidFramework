import { KafkaOrdererFactory } from "@prague/kafka-orderer";
import { DocumentStorage, EventHubProducer, HttpServer, MongoDbFactory, Tenant, WebServer } from "@prague/services";
import { GitManager, Historian } from "@prague/services-client";
import * as core from "@prague/services-core";
import { ITenantConfig } from "@prague/services-core";
import * as utils from "@prague/services-utils";
import * as bytes from "bytes";
import { EventEmitter } from "events";
import * as http from "http";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as util from "util";
import * as winston from "winston";
import { AlfredRunner } from "./runner";

type RequestListener = (request: http.IncomingMessage, response: http.ServerResponse) => void;

const socketJoin = util.promisify(
    (socket: SocketIO.Socket, roomId: string, callback: (err: NodeJS.ErrnoException) => void) => {
        socket.join(roomId, callback);
    });

class SocketIoSocket implements core.IWebSocket {
    public get id(): string {
        return this.socket.id;
    }

    constructor(private socket: SocketIO.Socket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        await socketJoin(this.socket, id);
    }

    public async emit(event: string, ...args: any[]) {
        this.socket.emit(event, ...args);
    }

    public async emitToRoom(roomId: string, event: string, ...args: any[]) {
        this.socket.nsp.to(roomId).emit(event, ...args);
    }

    public async broadcastToRoom(roomId: string, event: string, ...args: any) {
        this.socket.to(roomId).broadcast.emit(event, ...args);
    }
}

class SocketIoServer implements core.IWebSocketServer {
    private events = new EventEmitter();

    constructor(private io: SocketIO.Server, private pub: redis.RedisClient, private sub: redis.RedisClient) {
        this.io.on("connection", (socket: SocketIO.Socket) => {
            const webSocket = new SocketIoSocket(socket);
            this.events.emit("connection", webSocket);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        const pubClosedP = util.promisify(((callback) => this.pub.quit(callback)) as any)();
        const subClosedP = util.promisify(((callback) => this.sub.quit(callback)) as any)();
        const ioClosedP = util.promisify(((callback) => this.io.close(callback)) as any)();
        await Promise.all([pubClosedP, subClosedP, ioClosedP]);
    }
}

function create(redisConfig: any, server: http.Server): core.IWebSocketServer {
    const options: any = { auth_pass: redisConfig.pass };
    if (redisConfig.tls !== undefined) {
        options.tls = {
            servername: redisConfig.host,
        };
    }

    const pubOptions = _.clone(options);
    const subOptions = _.clone(options);
    const pub = redis.createClient(redisConfig.port, redisConfig.host, pubOptions);
    const sub = redis.createClient(redisConfig.port, redisConfig.host, subOptions);

    // Create and register a socket.io connection on the server
    const io = socketIo();
    io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));
    io.attach(server);
    return new SocketIoServer(io, pub, sub);
}

class SocketIoWebServerFactory implements core.IWebServerFactory {
    constructor(private redisConfig: any) {
    }

    public create(requestListener: RequestListener): core.IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        const socketIoServer = create(this.redisConfig, server);

        return new WebServer(httpServer, socketIoServer);
    }
}

export class OrdererManager implements core.IOrdererManager {
    constructor(
        private ordererUrl: string,
        private tenantManager: core.ITenantManager,
        private eventHubFactory: KafkaOrdererFactory,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const tenant = await this.tenantManager.getTenant(tenantId);

        winston.info(tenant.orderer);
        winston.info(tenant.orderer.url);

        if (tenant.orderer.url !== this.ordererUrl) {
            return Promise.reject(`Invalid ordering service endpoint ${tenant.orderer.url} !== ${this.ordererUrl}`);
        }

        return this.eventHubFactory.create(tenantId, documentId);
    }
}

export class AlfredResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: EventHubProducer,
        public redisConfig,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public storage: core.IDocumentStorage,
        public mongoManager: core.MongoManager,
        public port: any,
        public contentCollection: core.ICollection<any>,
    ) {
        this.webServerFactory = new SocketIoWebServerFactory(this.redisConfig);
    }

    public async dispose(): Promise<void> {
        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}

class TenantManager implements core.ITenantManager {
    private tenant: Tenant;

    constructor(private config: ITenantConfig, private key: string) {
        const historian = new Historian(
            "https://api.github.com/kurtb/praguedocs",
            false,
            false,
            {
                password: "8d043006d0a2704d4dd9972f848f1982026672a1",
                user: "praguegit",
            });
        const gitManager = new GitManager(historian);
        this.tenant = new Tenant(config, gitManager);
    }

    public async getTenant(tenantId: string): Promise<core.ITenant> {
        if (tenantId !== this.tenant.id) {
            return Promise.reject("Invalid tenant");
        }

        return this.tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        if (tenantId !== this.tenant.id) {
            return Promise.reject("Invalid tenant");
        }

        return new Promise((resolve, reject) => {
            jwt.verify(token, this.key, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    public async getKey(tenantId: string): Promise<string> {
        if (tenantId !== this.tenant.id) {
            return Promise.reject("Invalid tenant");
        }

        return this.key;
    }
}

export class AlfredResourcesFactory implements utils.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        // Producer used to publish messages
        const topic = config.get("alfred:topic");
        const redisConfig = config.get("redis");

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new MongoDbFactory(mongoUrl);
        const mongoManager = new core.MongoManager(mongoFactory);
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
        const nodeCollectionName = config.get("mongo:collectionNames:nodes");

        const databaseManager = new core.MongoDatabaseManager(
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName);

        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));

        // event hub ordering service
        const eventHubProducer = new EventHubProducer(config.get("eventHub:endpoint"), topic);

        const tenantConfig = config.get("tenantConfig");
        const tenantManager = new TenantManager(tenantConfig, tenantConfig.key);

        const storage = new DocumentStorage(databaseManager, tenantManager, eventHubProducer);

        const eventHubOrdererFactory = new KafkaOrdererFactory(
            eventHubProducer,
            storage,
            maxSendMessageSize);

        const contentCollection = db.collection("content");
        await contentCollection.createIndex(
            {
                documentId: 1,
                sequenceNumber: 1,
                tenantId: 1,
            },
            false);

        const serverUrl = config.get("alfred:url");

        const orderManager = new OrdererManager(
            serverUrl,
            tenantManager,
            eventHubOrdererFactory);

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        return new AlfredResources(
            config,
            eventHubProducer,
            redisConfig,
            orderManager,
            tenantManager,
            storage,
            mongoManager,
            port,
            contentCollection);
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
            resources.storage,
            resources.mongoManager,
            resources.contentCollection);
    }
}
