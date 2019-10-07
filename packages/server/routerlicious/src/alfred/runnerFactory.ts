/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { KafkaOrdererFactory } from "@microsoft/fluid-server-kafka-orderer";
import {
    LocalNodeFactory,
    LocalOrderManager,
    NodeManager,
    ReservationManager,
} from "@microsoft/fluid-server-memory-orderer";
import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import * as os from "os";
import * as redis from "redis";
import * as winston from "winston";
import * as ws from "ws";
import { AlfredRunner } from "./runner";
import { DefaultServiceConfiguration } from "./utils";

class NodeWebSocketServer implements core.IWebSocketServer {
    private webSocketServer: ws.Server;

    constructor(portNumber: number) {
        this.webSocketServer = new ws.Server({ port: portNumber });
    }
    public on(event: string, listener: (...args: any[]) => void) {
        this.webSocketServer.on(event, listener);
    }
    public close(): Promise<void> {
        this.webSocketServer.close();
        return Promise.resolve();
    }
}

export class OrdererManager implements core.IOrdererManager {
    constructor(
        private ordererUrl: string,
        private tenantManager: core.ITenantManager,
        private localOrderManager: LocalOrderManager,
        private kafkaFactory: KafkaOrdererFactory,
        private eventHubFactory: KafkaOrdererFactory,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const tenant = await this.tenantManager.getTenant(tenantId);

        winston.info(tenant.orderer);
        winston.info(tenant.orderer.url);

        if (tenant.orderer.url !== this.ordererUrl) {
            return Promise.reject("Invalid ordering service endpoint");
        }

        switch (tenant.orderer.type) {
            case "kafka":
                return this.kafkaFactory.create(tenantId, documentId);
            case "eventHub":
                return this.eventHubFactory.create(tenantId, documentId);
            default:
                return this.localOrderManager.get(tenantId, documentId);
        }
    }
}

export class AlfredResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public producer: core.IProducer,
        public redisConfig: any,
        public clientManager: core.IClientManager,
        public webSocketLibrary: string,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public storage: core.IDocumentStorage,
        public appTenants: core.IAlfredTenant[],
        public mongoManager: core.MongoManager,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any,
        public contentCollection: core.ICollection<any>) {

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
        const maxKafkaMessageSize = bytes.parse(config.get("kafka:maxMessageSize"));
        const producer = services.createProducer(
            kafkaLibrary,
            kafkaEndpoint,
            kafkaClientId,
            topic,
            maxKafkaMessageSize);
        const redisConfig = config.get("redis");
        const webSocketLibrary = config.get("alfred:webSocketLib");
        const authEndpoint = config.get("auth:endpoint");

        // Redis connection for client manaeger.
        const redisConfig2 = config.get("redis2");
        const redisClient = redis.createClient(redisConfig2.port, redisConfig2.host);
        const clientManager = new services.ClientManager(redisClient);

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
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
        const scribeCollectionName = config.get("mongo:collectionNames:scribeDeltas");

        // foreman agent uploader does not run locally.
        // TODO: Make agent uploader run locally.
        const foremanConfig = config.get("foreman");
        const taskMessageSender = services.createMessageSender(config.get("rabbitmq"), foremanConfig);
        await taskMessageSender.initialize();

        const nodeCollectionName = config.get("mongo:collectionNames:nodes");
        const nodeManager = new NodeManager(mongoManager, nodeCollectionName);
        // this.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
        const reservationManager = new ReservationManager(
            nodeManager,
            mongoManager,
            config.get("mongo:collectionNames:reservations"));

        const tenantManager = new services.TenantManager(authEndpoint, config.get("worker:blobStorageUrl"));

        const databaseManager = new core.MongoDatabaseManager(
            mongoManager,
            nodeCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            scribeCollectionName);

        const storage = new services.DocumentStorage(databaseManager, tenantManager, producer);

        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));

        const contentCollection = db.collection("content");
        await contentCollection.createIndex(
            {
                documentId: 1,
                sequenceNumber: 1,
                tenantId: 1,
            },
            false);

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
            maxSendMessageSize);
        const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
        const kafkaOrdererFactory = new KafkaOrdererFactory(
            producer,
            maxSendMessageSize,
            DefaultServiceConfiguration);
        const serverUrl = config.get("worker:serverUrl");

        let eventHubOrdererFactory: KafkaOrdererFactory = null;
        if (config.get("eventHub")) {
            const eventHubProducer = new services.EventHubProducer(config.get("eventHub:endpoint"), topic);
            eventHubOrdererFactory = new KafkaOrdererFactory(
                eventHubProducer,
                maxSendMessageSize,
                DefaultServiceConfiguration);
        }

        const orderManager = new OrdererManager(
            serverUrl,
            tenantManager,
            localOrderManager,
            kafkaOrdererFactory,
            eventHubOrdererFactory);

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
            storage,
            appTenants,
            mongoManager,
            port,
            documentsCollectionName,
            metricClientConfig,
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
            resources.clientManager,
            resources.appTenants,
            resources.mongoManager,
            resources.producer,
            resources.metricClientConfig,
            resources.contentCollection);
    }
}
