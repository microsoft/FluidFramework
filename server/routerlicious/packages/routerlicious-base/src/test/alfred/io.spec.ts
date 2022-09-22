/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Deferred } from "@fluidframework/common-utils";
import {
    IClientJoin,
    IConnect,
    IConnected,
    ISequencedDocumentSystemMessage,
    MessageType,
    ScopeType,
    ISummaryTree,
    SummaryType,
    ICommittedProposal,
    INack,
    INackContent,
    NackErrorType,
    IClient,
} from "@fluidframework/protocol-definitions";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import { LocalWebSocket, LocalWebSocketServer } from "@fluidframework/server-local-server";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import { PubSub } from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import { defaultHash } from "@fluidframework/server-services-client";
import { generateToken } from "@fluidframework/server-services-utils";
import {
    clientConnectivityStorageId,
    DefaultMetricClient,
    DefaultServiceConfiguration,
    IClientManager,
    IDeliState,
    IOrdererManager,
    IScribe,
    MongoDatabaseManager,
    MongoManager,
    RawOperationType,
    signalUsageStorageId,
} from "@fluidframework/server-services-core";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
    MessageFactory,
    TestClientManager,
    TestDbFactory,
    TestKafka,
    TestTenantManager,
    DebugLogger,
    TestThrottler,
    TestThrottleAndUsageStorageManager,
} from "@fluidframework/server-test-utils";
import { OrdererManager } from "../../alfred";
import { Throttler, ThrottlerHelper } from "@fluidframework/server-services";
import Sinon from "sinon";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
    Lumberjack.setup([lumberjackEngine]);
}

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("WebSockets", () => {
            describe("Messages", () => {
                const testTenantId = "test";
                const testSecret = "test";
                const testId = "test";
                const url = "http://test";

                let webSocketServer: LocalWebSocketServer;
                let deliKafka: TestKafka;
                let testOrderer: IOrdererManager;
                let testTenantManager: TestTenantManager;
                let testClientManager: IClientManager;

                const throttleLimit = 5;

                beforeEach(() => {
                    const collectionNames = "test";
                    const testData: { [key: string]: any[] } = {};

                    deliKafka = new TestKafka();
                    const producer = deliKafka.createProducer();
                    testTenantManager = new TestTenantManager(url);
                    testClientManager = new TestClientManager();
                    const testDbFactory = new TestDbFactory(testData);
                    const mongoManager = new MongoManager(testDbFactory);
                    const globalDbEnabled = false;
                    const databaseManager = new MongoDatabaseManager(
                        globalDbEnabled,
                        mongoManager,
                        mongoManager,
                        collectionNames,
                        collectionNames,
                        collectionNames,
                        collectionNames);
                    const testStorage = new services.DocumentStorage(
                        databaseManager,
                        testTenantManager,
                        false,
                    );
                    const kafkaOrderer = new KafkaOrdererFactory(
                        producer,
                        1024 * 1024,
                        DefaultServiceConfiguration);
                    testOrderer = new OrdererManager(false, url, testTenantManager, null, kafkaOrderer);

                    const pubsub = new PubSub();
                    webSocketServer = new LocalWebSocketServer(pubsub);

                    const testConnectionThrottler = new TestThrottler(throttleLimit);
                    const testSubmitOpThrottler = new TestThrottler(throttleLimit);

                    configureWebSocketServices(
                        webSocketServer,
                        testOrderer,
                        testTenantManager,
                        testStorage,
                        testClientManager,
                        new DefaultMetricClient(),
                        DebugLogger.create("fluid-server:TestAlfredIO"),
                        undefined,
                        undefined,
                        100,
                        false,
                        false,
                        false,
                        testConnectionThrottler,
                        testSubmitOpThrottler,
                        undefined,
                        undefined);
                });

                function connectToServer(
                    id: string,
                    tenantId: string,
                    secret: string,
                    socket: LocalWebSocket): Promise<IConnected> {
                    const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
                    const token = generateToken(tenantId, id, secret, scopes);

                    const connectMessage: IConnect = {
                        client: undefined,
                        id,
                        mode: "write",
                        tenantId,
                        token,
                        versions: ["^0.3.0", "^0.2.0", "^0.1.0"],
                    };

                    const deferred = new Deferred<IConnected>();

                    socket.on("connect_document_success", (connectedMessage: IConnected) => {
                        deferred.resolve(connectedMessage);
                    });

                    socket.on("connect_document_error", (error: any) => {
                        deferred.reject(error);
                    });

                    socket.on("nack", (reason: string, nackMessages: INack[]) => {
                        deferred.reject(nackMessages);
                    });

                    socket.send(
                        "connect_document",
                        connectMessage,
                        (error: any, connectedMessage: IConnected) => {
                            if (error) {
                                deferred.reject(error);
                            } else {
                                deferred.resolve(connectedMessage);
                            }
                        });


                    return deferred.promise;
                }


                describe("#connect_document", () => {
                    it("Should connect to and create a new interactive document on first connection", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, testTenantId, testSecret, socket);
                        assert.ok(connectMessage.clientId);
                        assert.equal(connectMessage.existing, true);

                        // Verify a connection message was sent
                        const message = deliKafka.getLastMessage();
                        const systemJoinMessage = message.operation as ISequencedDocumentSystemMessage;
                        assert.equal(message.documentId, testId);
                        assert.equal(systemJoinMessage.clientId, undefined);
                        assert.equal(systemJoinMessage.type, MessageType.ClientJoin);
                        const JoinMessage = JSON.parse(systemJoinMessage.data) as IClientJoin;
                        assert.equal(JoinMessage.clientId, connectMessage.clientId);
                    });

                    it("Should support multiple connections to an existing document",
                        async () => {
                            const firstSocket = webSocketServer.createConnection();
                            const firstConnectMessage = await connectToServer(
                                testId, testTenantId, testSecret, firstSocket);
                            assert.equal(firstConnectMessage.existing, true);

                            const secondSocket = webSocketServer.createConnection();
                            const secondConnectMessage = await connectToServer(
                                testId, testTenantId, testSecret, secondSocket);
                            assert.equal(secondConnectMessage.existing, true);
                        });


                    it("Should throttle excess connections for tenant", async () => {
                        for (let i = 0; i < throttleLimit; i++) {
                            const id = `${testId}-${i}`;
                            const socket = webSocketServer.createConnection();
                            const connectMessage = await connectToServer(id, testTenantId, testSecret, socket);
                            assert.ok(connectMessage.clientId);
                            assert.equal(connectMessage.existing, true);

                            // Verify a connection message was sent
                            const message = deliKafka.getLastMessage();
                            const systemJoinMessage = message.operation as ISequencedDocumentSystemMessage;
                            assert.equal(message.documentId, id);
                            assert.equal(systemJoinMessage.clientId, undefined);
                            assert.equal(systemJoinMessage.type, MessageType.ClientJoin);
                            const JoinMessage = JSON.parse(systemJoinMessage.data) as IClientJoin;
                            assert.equal(JoinMessage.clientId, connectMessage.clientId);
                        }

                        const failedConnectMessage = await connectToServer(`${testId}-${throttleLimit + 1}`, testTenantId, testSecret, webSocketServer.createConnection())
                            .then(() => {
                                assert.fail("Connection should have failed");
                            })
                            .catch((err) => {
                                return err;
                            }) as INackContent;
                        assert.strictEqual(failedConnectMessage.code, 429);
                        assert.strictEqual(failedConnectMessage.type, NackErrorType.ThrottlingError);
                        assert.strictEqual(failedConnectMessage.retryAfter, 1);

                        // A separate tenant should not be throttled
                        await connectToServer(testId, `${testTenantId}-2`, testSecret, webSocketServer.createConnection());
                    });
                });

                describe("#disconnect", () => {
                    it("Should disconnect from an interactive document", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, testTenantId, testSecret, socket);
                        socket.send("disconnect");

                        // Connect a second client just to have something to await on.
                        // There is no ack for the disconnect, but the message will be ordered with future messages.
                        await connectToServer(testId, testTenantId, testSecret, webSocketServer.createConnection());

                        assert.equal(deliKafka.getRawMessages().length, 3);
                        const message = deliKafka.getMessage(1);
                        assert.equal(message.documentId, testId);
                        const systemLeaveMessage = message.operation as ISequencedDocumentSystemMessage;
                        assert.equal(systemLeaveMessage.clientId, undefined);
                        assert.equal(systemLeaveMessage.type, MessageType.ClientLeave);
                        const clientId = JSON.parse(systemLeaveMessage.data) as string;
                        assert.equal(clientId, connectMessage.clientId);
                    });
                });

                describe("#submitOp", () => {
                    it("Can connect to the web socket server", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, testTenantId, testSecret, socket);

                        const messageFactory = new MessageFactory(testId, connectMessage.clientId);
                        const message = messageFactory.createDocumentMessage();

                        const beforeCount = deliKafka.getRawMessages().length;
                        socket.send("submitOp", connectMessage.clientId, [message]);
                        assert.equal(deliKafka.getRawMessages().length, beforeCount + 1);
                        const lastMessage = deliKafka.getLastMessage();
                        assert.equal(lastMessage.documentId, testId);
                        assert.equal(lastMessage.type, RawOperationType);
                        assert.deepEqual(lastMessage.operation, message);
                    });

                    it("Should throttle excess submitOps for tenant", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, testTenantId, testSecret, socket);

                        const messageFactory = new MessageFactory(testId, connectMessage.clientId);

                        let i = 0;
                        const deferredNack = new Deferred<INack[]>();
                        socket.on("nack", (reason: string, nackMessages: INack[]) => {
                            if (i < throttleLimit) {
                                deferredNack.reject(`Submit op NACK before reaching throttle limit: ${nackMessages}`);
                            } else {
                                deferredNack.resolve(nackMessages);
                            }
                        });
                        for (; i < throttleLimit; i++) {
                            const message = messageFactory.createDocumentMessage();

                            const beforeCount = deliKafka.getRawMessages().length;
                            socket.send("submitOp", connectMessage.clientId, [message]);
                            assert.equal(deliKafka.getRawMessages().length, beforeCount + 1);
                            const lastMessage = deliKafka.getLastMessage();
                            assert.equal(lastMessage.documentId, testId);
                            assert.equal(lastMessage.type, RawOperationType);
                            assert.deepEqual(lastMessage.operation, message);
                        }

                        const blockedMessage = messageFactory.createDocumentMessage();
                        socket.send("submitOp", connectMessage.clientId, [blockedMessage]);
                        const nackMessages = await deferredNack.promise;

                        const nackContent = nackMessages[0]?.content as INackContent;
                        assert.strictEqual(nackContent.code, 429);
                        assert.strictEqual(nackContent.type, NackErrorType.ThrottlingError);
                        assert.strictEqual(nackContent.retryAfter, 1);
                    });
                });
            });

            describe("UsageCounting", () => {
                const testTenantId = "test";
                const testSecret = "test";
                const testId = "test";
                const url = "http://test";

                let webSocketServer: LocalWebSocketServer;
                let deliKafka: TestKafka;
                let testOrderer: IOrdererManager;
                let testTenantManager: TestTenantManager;
                let testClientManager: IClientManager;

                const throttleLimit = 5;
                const minThrottleCheckInterval = 100;
                const testThrottleAndUsageStorageManager = new TestThrottleAndUsageStorageManager();

                beforeEach(() => {
                    // use fake timers to have full control over the passage of time
                    Sinon.useFakeTimers(Date.now());

                    const collectionNames = "test";
                    const testData: { [key: string]: any[] } = {};

                    deliKafka = new TestKafka();
                    const producer = deliKafka.createProducer();
                    testTenantManager = new TestTenantManager(url);
                    testClientManager = new TestClientManager();
                    const testDbFactory = new TestDbFactory(testData);
                    const mongoManager = new MongoManager(testDbFactory);
                    const globalDbEnabled = false;
                    const databaseManager = new MongoDatabaseManager(
                        globalDbEnabled,
                        mongoManager,
                        mongoManager,
                        collectionNames,
                        collectionNames,
                        collectionNames,
                        collectionNames);
                    const testStorage = new services.DocumentStorage(
                        databaseManager,
                        testTenantManager,
                        false,
                    );
                    const kafkaOrderer = new KafkaOrdererFactory(
                        producer,
                        1024 * 1024,
                        DefaultServiceConfiguration);
                    testOrderer = new OrdererManager(false, url, testTenantManager, null, kafkaOrderer);

                    const pubsub = new PubSub();
                    webSocketServer = new LocalWebSocketServer(pubsub);

                    const testConnectionThrottler = new TestThrottler(throttleLimit);
                    const testSubmitOpThrottler = new TestThrottler(throttleLimit);
                    const throttlerHelper = new ThrottlerHelper(testThrottleAndUsageStorageManager);

                    const testSubmitSignalThrottler = new Throttler(throttlerHelper, minThrottleCheckInterval);

                    configureWebSocketServices(
                        webSocketServer,
                        testOrderer,
                        testTenantManager,
                        testStorage,
                        testClientManager,
                        new DefaultMetricClient(),
                        DebugLogger.create("fluid-server:TestAlfredIO"),
                        undefined,
                        undefined,
                        100,
                        false,
                        true,
                        true,
                        testConnectionThrottler,
                        testSubmitOpThrottler,
                        testSubmitSignalThrottler,
                        testThrottleAndUsageStorageManager);
                });

                afterEach(() => {
                    Sinon.restore();
                });

                function connectToServer(
                    id: string,
                    tenantId: string,
                    clientType: string,
                    secret: string,
                    socket: LocalWebSocket): Promise<IConnected> {
                    const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
                    const token = generateToken(tenantId, id, secret, scopes);

                    const client: IClient = {
                        mode: undefined,
                        permission: undefined,
                        user: undefined,
                        scopes: undefined,
                        details: {
                            capabilities: undefined,
                            type: clientType,
                        }
                    };
                    const connectMessage: IConnect = {
                        client: client,
                        id,
                        mode: "write",
                        tenantId,
                        token,
                        versions: ["^0.3.0", "^0.2.0", "^0.1.0"],
                    };

                    const deferred = new Deferred<IConnected>();

                    socket.on("connect_document_success", (connectedMessage: IConnected) => {
                        deferred.resolve(connectedMessage);
                    });

                    socket.on("connect_document_error", (error: any) => {
                        deferred.reject(error);
                    });

                    socket.on("nack", (reason: string, nackMessages: INack[]) => {
                        deferred.reject(nackMessages);
                    });

                    socket.send(
                        "connect_document",
                        connectMessage,
                        (error: any, connectedMessage: IConnected) => {
                            if (error) {
                                deferred.reject(error);
                            } else {
                                deferred.resolve(connectedMessage);
                            }
                        });


                    return deferred.promise;
                }

                describe("connection time", () => {
                    it("Should not store the summarizer client connection time upon disconnect", async () => {
                        const clientConnectionTime = 100;
                        const socket = webSocketServer.createConnection();
                        await connectToServer(testId, testTenantId, "summarizer", testSecret, socket);
                        Sinon.clock.tick(clientConnectionTime);
                        socket.send("disconnect");

                        const usageData = await testThrottleAndUsageStorageManager.getUsageData(clientConnectivityStorageId);
                        assert.equal(usageData, undefined);
                    });

                    it("Should store the client connection time upon disconnect", async () => {
                        const clientConnectionTime = 100;
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, testTenantId, "client", testSecret, socket);
                        Sinon.clock.tick(clientConnectionTime);
                        socket.send("disconnect");

                        const usageData = await testThrottleAndUsageStorageManager.getUsageData(clientConnectivityStorageId);
                        assert.equal(usageData.value, clientConnectionTime/60000);
                        assert.equal(usageData.clientId, connectMessage.clientId);
                        assert.equal(usageData.tenantId, testTenantId);
                        assert.equal(usageData.documentId, testId);
                    });
                });

                describe("signal count", () => {
                    it("Should store the signal count when throttler is invoked", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, testTenantId, "client", testSecret, socket);

                        let i = 0;
                        const signalCount = 10;
                        const message = "testSignalMessage";
                        for (; i < signalCount; i++) {
                            socket.send("submitSignal", connectMessage.clientId, [message]);
                        }
                        Sinon.clock.tick(minThrottleCheckInterval+1);
                        socket.send("submitSignal", connectMessage.clientId, [message]);
                        // wait for throttler to be checked
                        await Sinon.clock.nextAsync();

                        const usageData = await testThrottleAndUsageStorageManager.getUsageData(signalUsageStorageId);
                        assert.equal(usageData.value, signalCount+1);
                        assert.equal(usageData.clientId, connectMessage.clientId);
                        assert.equal(usageData.tenantId, testTenantId);
                        assert.equal(usageData.documentId, testId);
                    });
                });
            });
        });        
    });

    describe("storage", () => {
        const testTenantId = "test";
        const testId = "test";
        const url = "http://test";

        let testTenantManager: TestTenantManager;
        let testStorage: services.DocumentStorage;
        beforeEach(() => {
            const collectionNames = "test";
            const testData: { [key: string]: any[] } = {};

            testTenantManager = new TestTenantManager(url);
            const testDbFactory = new TestDbFactory(testData);
            const mongoManager = new MongoManager(testDbFactory);
            const globalDbEnabled = false;
            const databaseManager = new MongoDatabaseManager(
                globalDbEnabled,
                mongoManager,
                mongoManager,
                collectionNames,
                collectionNames,
                collectionNames,
                collectionNames);
            testStorage = new services.DocumentStorage(
                databaseManager,
                testTenantManager,
                false,
            );
        });

        it("create document with summary", async () => {
            const summaryTree: ISummaryTree = { type: SummaryType.Tree, tree: {} };
            const proposal: ICommittedProposal = {
                key: "code",
                value: "empty",
                approvalSequenceNumber: 0,
                commitSequenceNumber: 0,
                sequenceNumber: 0,
            };
            const docDetails = await testStorage.createDocument(testTenantId, testId, summaryTree, 10, 1, defaultHash, url, url, [["code", proposal]]);
            assert.equal(docDetails.existing, false, "Doc should not be existing!!");
            assert.equal(docDetails.value.documentId, testId, "Docid should be the provided one!!");
            const deli: IDeliState = JSON.parse(docDetails.value.deli);
            assert.equal(deli.sequenceNumber, 10, "Seq number should be 10 at which the summary was generated!!");
            const scribe: IScribe = JSON.parse(docDetails.value.scribe);
            assert.equal(scribe.protocolState.values[0][1]["value"], "empty", "Code proposal value should be equal!!");
        });
    });
});
