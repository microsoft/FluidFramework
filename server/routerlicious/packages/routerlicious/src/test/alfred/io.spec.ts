/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-core-utils";
import {
    IClientJoin,
    IConnect,
    IConnected,
    IDocumentMessage,
    ISequencedDocumentSystemMessage,
    MessageType,
    ScopeType,
} from "@microsoft/fluid-protocol-definitions";
import { KafkaOrdererFactory } from "@microsoft/fluid-server-kafka-orderer";
import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import {
    MessageFactory,
    TestClientManager,
    TestCollection,
    TestDbFactory,
    TestKafka,
    TestTenantManager,
    TestWebSocket,
    TestWebSocketServer,
    DebugLogger,
} from "@microsoft/fluid-server-test-utils";
import * as assert from "assert";
import { OrdererManager } from "../../alfred/runnerFactory";
import { DefaultMetricClient } from "@microsoft/fluid-server-services-core";
import { generateToken } from "@microsoft/fluid-server-services-client";
import { configureWebSocketServices, DefaultServiceConfiguration } from "@microsoft/fluid-server-lambdas";

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("WebSockets", () => {
            describe("Messages", () => {
                const testTenantId = "test";
                const testSecret = "test";
                const testId = "test";
                const url = "http://test";

                let webSocketServer: TestWebSocketServer;
                let deliKafka: TestKafka;
                let testOrderer: core.IOrdererManager;
                let testTenantManager: TestTenantManager;
                let testClientManager: core.IClientManager;
                let contentCollection: TestCollection;

                beforeEach(() => {
                    const collectionNames = "test";
                    const testData: { [key: string]: any[] } = {};

                    deliKafka = new TestKafka();
                    const producer = deliKafka.createProducer();
                    testTenantManager = new TestTenantManager(url);
                    testClientManager = new TestClientManager();
                    const testDbFactory = new TestDbFactory(testData);
                    const mongoManager = new core.MongoManager(testDbFactory);
                    const databaseManager = new core.MongoDatabaseManager(
                        mongoManager,
                        collectionNames,
                        collectionNames,
                        collectionNames,
                        collectionNames);
                    const testStorage = new services.DocumentStorage(
                        databaseManager,
                        testTenantManager,
                        producer);
                    const kafkaOrderer = new KafkaOrdererFactory(
                        producer,
                        1024 * 1024,
                        DefaultServiceConfiguration);
                    testOrderer = new OrdererManager(url, testTenantManager, null, kafkaOrderer, null);

                    webSocketServer = new TestWebSocketServer();
                    contentCollection = new TestCollection([]);

                    configureWebSocketServices(
                        webSocketServer,
                        testOrderer,
                        testTenantManager,
                        testStorage,
                        contentCollection,
                        testClientManager,
                        new DefaultMetricClient(),
                        DebugLogger.create("fluid-server:TestAlfredIO"));
                });

                function connectToServer(
                    id: string,
                    tenantId: string,
                    secret: string,
                    socket: TestWebSocket): Promise<IConnected> {
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

                function sendMessage(
                    socket: TestWebSocket,
                    clientId: string,
                    message: IDocumentMessage): Promise<void> {

                    const deferred = new Deferred<void>();
                    socket.send("submitOp", clientId, [message], (error: any, response: any) => {
                        if (error) {
                            deferred.reject(error);
                        } else {
                            deferred.resolve(response);
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
                        assert.equal(systemJoinMessage.clientId, null);
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
                        assert.equal(systemLeaveMessage.clientId, null);
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
                        await sendMessage(socket, connectMessage.clientId, message);
                        assert.equal(deliKafka.getRawMessages().length, beforeCount + 1);
                        const lastMessage = deliKafka.getLastMessage();
                        assert.equal(lastMessage.documentId, testId);
                        assert.equal(lastMessage.type, core.RawOperationType);
                        assert.deepEqual(lastMessage.operation, message);
                    });
                });
            });
        });
    });
});
