/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as os from "os";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import {
    LocalNodeFactory,
    LocalOrderManager,
    NodeManager,
    ReservationManager,
} from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import Redis from "ioredis";
import * as winston from "winston";
import * as ws from "ws";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { AlfredRunner } from "./runner";

class NodeWebSocketServer implements core.IWebSocketServer {
    private readonly webSocketServer: ws.Server;

    constructor(portNumber: number) {
        this.webSocketServer = new ws.Server({ port: portNumber });
    }
    public on(event: string, listener: (...args: any[]) => void) {
        this.webSocketServer.on(event, listener);
    }
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        this.webSocketServer.close();
        return Promise.resolve();
    }
}

export class OrdererManager implements core.IOrdererManager {
    constructor(
        private readonly ordererUrl: string,
        private readonly tenantManager: core.ITenantManager,
        private readonly localOrderManager: LocalOrderManager,
        private readonly kafkaFactory: KafkaOrdererFactory,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const tenant = await this.tenantManager.getTenant(tenantId);

        const messageMetaData = { documentId, tenantId };
        winston.info(`tenant orderer: ${JSON.stringify(tenant.orderer)}`, { messageMetaData });

        if (tenant.orderer.url !== this.ordererUrl) {
            return Promise.reject(new Error("Invalid ordering service endpoint"));
        }

        switch (tenant.orderer.type) {
            case "kafka":
                return this.kafkaFactory.create(tenantId, documentId);
            default:
                return this.localOrderManager.get(tenantId, documentId);
        }
    }
}

export class AlfredResources implements core.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: core.IProducer,
        public redisConfig: any,
        public clientManager: core.IClientManager,
        public webSocketLibrary: string,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public restThrottler: core.IThrottler,
        public socketConnectThrottler: core.IThrottler,
        public socketSubmitOpThrottler: core.IThrottler,
        public storage: core.IDocumentStorage,
        public appTenants: IAlfredTenant[],
        public mongoManager: core.MongoManager,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any) {
        const socketIoAdapterConfig = config.get("alfred:socketIoAdapter");
        this.webServerFactory = new services.SocketIoWebServerFactory(this.redisConfig, socketIoAdapterConfig);
    }

    public async dispose(): Promise<void> {
        const producerClosedP = this.producer.close();
        const mongoClosedP = this.mongoManager.close();
        await Promise.all([producerClosedP, mongoClosedP]);
    }
}

export class AlfredResourcesFactory implements core.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        // Producer used to publish messages
        const kafkaEndpoint = config.get("kafka:lib:endpoint");
        const kafkaLibrary = config.get("kafka:lib:name");
        const kafkaClientId = config.get("alfred:kafkaClientId");
        const topic = config.get("alfred:topic");
        const metricClientConfig = config.get("metric");
        const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
        const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
        const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
        const producer = services.createProducer(
            kafkaLibrary,
            kafkaEndpoint,
            kafkaClientId,
            topic,
            false,
            kafkaProducerPollIntervalMs,
            kafkaNumberOfPartitions,
            kafkaReplicationFactor);

        const redisConfig = config.get("redis");
        const webSocketLibrary = config.get("alfred:webSocketLib");
        const authEndpoint = config.get("auth:endpoint");

        // Redis connection for client manager.
        const redisConfig2 = config.get("redis2");
        const redisOptions2: Redis.RedisOptions = {
            host: redisConfig2.host,
            port: redisConfig2.port,
            password: redisConfig2.pass,
        };
        if (redisConfig2.tls) {
            redisOptions2.tls = {
                servername: redisConfig2.host,
            };
        }

        const redisParams2 = {
            expireAfterSeconds: redisConfig2.keyExpireAfterSeconds as number | undefined,
        };

        const redisClient = new Redis(redisOptions2);
        const clientManager = new services.ClientManager(redisClient, redisParams2);

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new core.MongoManager(mongoFactory);
        const documentsCollectionName = config.get("mongo:collectionNames:documents");

        // Create the index on the documents collection
        const db = await mongoManager.getDatabase();
        const documentsCollection = db.collection<core.IDocument>(documentsCollectionName);
        await documentsCollection.createIndex(
            {
                documentId: 1,
                tenantId: 1,
            },
            true);
        const deltasCollectionName = config.get("mongo:collectionNames:deltas");
        const scribeCollectionName = config.get("mongo:collectionNames:scribeDeltas");

        // Foreman agent uploader does not run locally.
        // TODO: Make agent uploader run locally.
        const foremanConfig = config.get("foreman");
        const taskMessageSender = services.createMessageSender(config.get("rabbitmq"), foremanConfig);
        await taskMessageSender.initialize();

        const nodeCollectionName = config.get("mongo:collectionNames:nodes");
        const nodeManager = new NodeManager(mongoManager, nodeCollectionName);
        // This.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
        const reservationManager = new ReservationManager(
            nodeManager,
            mongoManager,
            config.get("mongo:collectionNames:reservations"));

        const tenantManager = new services.TenantManager(authEndpoint);

        // Redis connection for throttling.
        const redisConfigForThrottling = config.get("redisForThrottling");
        const redisOptionsForThrottling: Redis.RedisOptions = {
            host: redisConfigForThrottling.host,
            port: redisConfigForThrottling.port,
            password: redisConfigForThrottling.pass,
        };
        if (redisConfigForThrottling.tls) {
            redisOptionsForThrottling.tls = {
                servername: redisConfigForThrottling.host,
            };
        }
        const redisParamsForThrottling = {
            expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as number | undefined,
        };

        const redisClientForThrottling = new Redis(redisOptionsForThrottling);

        // Rest API Throttler
        const throttleMaxRequestsPerMs =
            config.get("alfred:throttling:restCalls:maxPerMs") as number | undefined;
        const throttleMaxRequestBurst =
            config.get("alfred:throttling:restCalls:maxBurst") as number | undefined;
        const throttleMinRequestCooldownIntervalInMs =
            config.get("alfred:throttling:restCalls:minCooldownIntervalInMs") as number | undefined;
        const throttleMinRequestThrottleIntervalInMs =
            config.get("alfred:throttling:restCalls:minThrottleIntervalInMs") as number | undefined;
        const throttleStorageManager =
            new services.RedisThrottleStorageManager(redisClientForThrottling, redisParamsForThrottling);
        const restThrottlerHelper = new services.ThrottlerHelper(
            throttleStorageManager,
            throttleMaxRequestsPerMs,
            throttleMaxRequestBurst,
            throttleMinRequestCooldownIntervalInMs);
        const restThrottler = new services.Throttler(
            restThrottlerHelper,
            throttleMinRequestThrottleIntervalInMs,
            winston);

        // Socket Connection Throttler
        const throttleMaxSocketConnectionsPerMs =
            config.get("alfred:throttling:socketConnections:maxPerMs") as number | undefined;
        const throttleMaxSocketConnectionBurst =
            config.get("alfred:throttling:socketConnections:maxBurst") as number | undefined;
        const throttleMinSocketConnectionCooldownIntervalInMs =
            config.get("alfred:throttling:socketConnections:minCooldownIntervalInMs") as number | undefined;
        const throttleMinSocketConnectionThrottleIntervalInMs =
            config.get("alfred:throttling:socketConnections:minThrottleIntervalInMs") as number | undefined;
        const socketConnectThrottlerHelper = new services.ThrottlerHelper(
            throttleStorageManager,
            throttleMaxSocketConnectionsPerMs,
            throttleMaxSocketConnectionBurst,
            throttleMinSocketConnectionCooldownIntervalInMs,
        );
        const socketConnectThrottler = new services.Throttler(
            socketConnectThrottlerHelper,
            throttleMinSocketConnectionThrottleIntervalInMs,
            winston);

        // Socket SubmitOp Throttler
        const throttleMaxSubmitOpsPerMs =
            config.get("alfred:throttling:submitOps:maxPerMs") as number | undefined;
        const throttleMaxSubmitOpBurst =
            config.get("alfred:throttling:submitOps:maxBurst") as number | undefined;
        const throttleMinSubmitOpCooldownIntervalInMs =
            config.get("alfred:throttling:submitOps:minCooldownIntervalInMs") as number | undefined;
        const throttleMinSubmitOpThrottleIntervalInMs =
            config.get("alfred:throttling:submitOps:minThrottleIntervalInMs") as number | undefined;
        const socketSubmitOpThrottlerHelper = new services.ThrottlerHelper(
            throttleStorageManager,
            throttleMaxSubmitOpsPerMs,
            throttleMaxSubmitOpBurst,
            throttleMinSubmitOpCooldownIntervalInMs);
        const socketSubmitOpThrottler = new services.Throttler(
            socketSubmitOpThrottlerHelper,
            throttleMinSubmitOpThrottleIntervalInMs,
            winston);

        const databaseManager = new core.MongoDatabaseManager(
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            scribeCollectionName);

        const storage = new services.DocumentStorage(databaseManager, tenantManager);

        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));
        const address = `${await utils.getHostIp()}:4000`;

        const nodeFactory = new LocalNodeFactory(
            os.hostname(),
            address,
            storage,
            databaseManager,
            60000,
            () => new NodeWebSocketServer(4000),
            taskMessageSender,
            tenantManager,
            foremanConfig.permissions,
            maxSendMessageSize,
            utils.generateToken,
            winston);
        const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
        const kafkaOrdererFactory = new KafkaOrdererFactory(
            producer,
            maxSendMessageSize,
            core.DefaultServiceConfiguration);
        const serverUrl = config.get("worker:serverUrl");

        const orderManager = new OrdererManager(
            serverUrl,
            tenantManager,
            localOrderManager,
            kafkaOrdererFactory);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("alfred:tenants") as { id: string, key: string }[];

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        return new AlfredResources(
            config,
            producer,
            redisConfig,
            clientManager,
            webSocketLibrary,
            orderManager,
            tenantManager,
            restThrottler,
            socketConnectThrottler,
            socketSubmitOpThrottler,
            storage,
            appTenants,
            mongoManager,
            port,
            documentsCollectionName,
            metricClientConfig);
    }
}

export class AlfredRunnerFactory implements core.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<core.IRunner> {
        return new AlfredRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.restThrottler,
            resources.socketConnectThrottler,
            resources.socketSubmitOpThrottler,
            resources.storage,
            resources.clientManager,
            resources.appTenants,
            resources.mongoManager,
            resources.producer,
            resources.metricClientConfig);
    }
}
