/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
} from "@fluidframework/protocol-definitions";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import { LocalWebSocket, LocalWebSocketServer } from "@fluidframework/server-local-server";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import { PubSub } from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import { generateToken } from "@fluidframework/server-services-utils";
import {
    DefaultMetricClient,
    DefaultServiceConfiguration,
    IClientManager,
    IDeliState,
    IOrdererManager,
    IScribe,
    MongoDatabaseManager,
    MongoManager,
    RawOperationType,
} from "@fluidframework/server-services-core";
import {
    MessageFactory,
    TestClientManager,
    TestDbFactory,
    TestKafka,
    TestTenantManager,
    DebugLogger,
} from "@fluidframework/server-test-utils";
import { OrdererManager } from "../../alfred";

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

                beforeEach(() => {
                    const collectionNames = "test";
                    const testData: { [key: string]: any[] } = {};

                    deliKafka = new TestKafka();
                    const producer = deliKafka.createProducer();
                    testTenantManager = new TestTenantManager(url);
                    testClientManager = new TestClientManager();
                    const testDbFactory = new TestDbFactory(testData);
                    const mongoManager = new MongoManager(testDbFactory);
                    const databaseManager = new MongoDatabaseManager(
                        mongoManager,
                        collectionNames,
                        collectionNames,
                        collectionNames,
                        collectionNames);
                    const testStorage = new services.DocumentStorage(
                        databaseManager,
                        testTenantManager,
                    );
                    const kafkaOrderer = new KafkaOrdererFactory(
                        producer,
                        1024 * 1024,
                        DefaultServiceConfiguration);
                    testOrderer = new OrdererManager(url, testTenantManager, null, kafkaOrderer, null);

                    const pubsub = new PubSub();
                    webSocketServer = new LocalWebSocketServer(pubsub);

                    configureWebSocketServices(
                        webSocketServer,
                        testOrderer,
                        testTenantManager,
                        testStorage,
                        testClientManager,
                        new DefaultMetricClient(),
                        DebugLogger.create("fluid-server:TestAlfredIO"));
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
                        mode: "read",
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
                        assert.equal(connectMessage.existing, false);

                        // Verify a connection message was sent
                        const message = deliKafka.getLastMessage();
                        const systemJoinMessage = message.operation as ISequencedDocumentSystemMessage;
                        assert.equal(message.documentId, testId);
                        assert.equal(systemJoinMessage.clientId, undefined);
                        assert.equal(systemJoinMessage.type, MessageType.ClientJoin);
                        const JoinMessage = JSON.parse(systemJoinMessage.data) as IClientJoin;
                        assert.equal(JoinMessage.clientId, connectMessage.clientId);
                    });

                    it("Should connect to and set existing flag to true when connecting to an existing document",
                        async () => {
                            const firstSocket = webSocketServer.createConnection();
                            const firstConnectMessage = await connectToServer(
                                testId, testTenantId, testSecret, firstSocket);
                            assert.equal(firstConnectMessage.existing, false);

                            const secondSocket = webSocketServer.createConnection();
                            const secondConnectMessage = await connectToServer(
                                testId, testTenantId, testSecret, secondSocket);
                            assert.equal(secondConnectMessage.existing, true);
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

                        assert.equal(deliKafka.getRawMessages().length, 2);
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
            const databaseManager = new MongoDatabaseManager(
                mongoManager,
                collectionNames,
                collectionNames,
                collectionNames,
                collectionNames);
            testStorage = new services.DocumentStorage(
                databaseManager,
                testTenantManager,
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
            const docDetails = await testStorage.createDocument(testTenantId, testId, summaryTree, 10, 1, [["code", proposal]]);
            assert.equal(docDetails.existing, false, "Doc should not be existing!!");
            assert.equal(docDetails.value.documentId, testId, "Docid should be the provided one!!");
            const deli: IDeliState = JSON.parse(docDetails.value.deli);
            assert.equal(deli.sequenceNumber, 10, "Seq number should be 10 at which the summary was generated!!");
            const scribe: IScribe = JSON.parse(docDetails.value.scribe);
            assert.equal(scribe.protocolState.values[0][1]["value"], "empty", "Code proposal value should be equal!!");
        });
    });
});
