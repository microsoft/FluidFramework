import * as assert from "assert";
import * as nconf from "nconf";
import * as path from "path";
import * as io from "../../alfred/io";
import * as api from "../../api-core";
import * as core from "../../core";
import { Deferred } from "../../core-utils";
import * as socketStorage from "../../socket-storage";
import { MongoManager } from "../../utils";
import { MessageFactory, TestDbFactory, TestKafka, TestWebSocket, TestWebSocketServer } from "../testUtils";

const defaultConfig = nconf.file(path.join(__dirname, "../../../config.test.json")).use("memory");

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("WebSockets", () => {
            describe("Messages", () => {
                const testId = "test";
                let webSocketServer: TestWebSocketServer;
                let deliKafka: TestKafka;

                beforeEach(() => {
                    const documentsCollectionName = "test";
                    const metricClientConfig = {};
                    const testData: { [key: string]: any[] } = {};
                    const endPoint: string = "";

                    const testDbFactory = new TestDbFactory(testData);
                    const mongoManager = new MongoManager(testDbFactory);
                    deliKafka = new TestKafka();
                    const producer = deliKafka.createProducer();

                    webSocketServer = new TestWebSocketServer();

                    io.register(webSocketServer, defaultConfig, mongoManager, producer,
                                documentsCollectionName, metricClientConfig, endPoint);
                });

                function connectToServer(id: string, socket: TestWebSocket): Promise<socketStorage.IConnected> {
                    const connectMessage: socketStorage.IConnect = {
                        id,
                    };

                    const deferred = new Deferred<socketStorage.IConnected>();
                    socket.send(
                        "connectDocument",
                        connectMessage,
                        (error: any, connectedMessage: socketStorage.IConnected) => {
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
                    message: api.IDocumentMessage): Promise<void> {

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

                describe("#connectDocument", () => {
                    it("Should connect to and create a new interactive document on first connection", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, socket);
                        assert.ok(connectMessage.clientId);
                        assert.equal(connectMessage.existing, false);

                        // Verify a connection message was sent
                        const message = deliKafka.getLastMessage();
                        assert.equal(message.documentId, testId);
                        assert.equal(message.operation.clientId, null);
                        assert.equal(message.operation.type, api.ClientJoin);
                        assert.equal(message.operation.contents, connectMessage.clientId);
                    });

                    it(
                        "Should connect to and set existing flag to true when connecting to an existing document",
                        async () => {
                            const firstSocket = webSocketServer.createConnection();
                            const firstConnectMessage = await connectToServer(testId, firstSocket);
                            assert.equal(firstConnectMessage.existing, false);

                            const secondSocket = webSocketServer.createConnection();
                            const secondConnectMessage = await connectToServer(testId, secondSocket);
                            assert.equal(secondConnectMessage.existing, true);
                        });
                });

                describe("#disconnect", () => {
                    it("Should disconnect from an interactive document", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, socket);
                        socket.send("disconnect");

                        // Connect a second client just to have something to await on.
                        // There is no ack for the disconnect, but the message will be ordered with future messages.
                        await connectToServer(testId, webSocketServer.createConnection());

                        assert.equal(deliKafka.getRawMessages().length, 3);
                        const message = deliKafka.getMessage(1);
                        assert.equal(message.documentId, testId);
                        assert.equal(message.operation.clientId, null);
                        assert.equal(message.operation.type, api.ClientLeave);
                        assert.equal(message.operation.contents, connectMessage.clientId);
                    });
                });

                describe("#submitOp", () => {
                    it("Can connect to the web socket server", async () => {
                        const socket = webSocketServer.createConnection();
                        const connectMessage = await connectToServer(testId, socket);

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
