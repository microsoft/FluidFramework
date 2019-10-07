/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IConnect, IConnected } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IContentMessage,
    IDocumentMessage,
    ISignalMessage,
    ITokenClaims,
    MessageType
} from "@microsoft/fluid-protocol-definitions";
import {
    LocalNodeFactory,
    LocalOrderer,
    LocalOrderManager,
} from "@microsoft/fluid-server-memory-orderer";
import {
    IDatabaseManager,
    IDocumentStorage,
    IOrderer,
    IOrdererConnection,
    IOrdererManager,
    ITenantManager,
    IWebSocket,
    IWebSocketServer,
    MongoDatabaseManager,
    MongoManager,
} from "@microsoft/fluid-server-services-core";
import {
    ITestDbFactory,
    TestDbFactory,
    TestDocumentStorage,
    TestTaskMessageSender,
    TestTenantManager,
    TestWebSocketServer,
} from "@microsoft/fluid-server-test-utils";
import * as jwt from "jsonwebtoken";
import * as randomName from "random-name";
import * as semver from "semver";
import { TestReservationManager } from "./testReserverationManger";

const protocolVersion = "^0.1.0";

/**
 * Items needed for handling deltas.
 */
export interface ITestDeltaConnectionServer {
    webSocketServer: IWebSocketServer;
    databaseManager: IDatabaseManager;
    testDbFactory: ITestDbFactory;
    hasPendingWork(): Promise<boolean>;
}

/**
 * Implementation of order manager for testing.
 */
class TestOrderManager implements IOrdererManager {
    private readonly orderersP: Promise<IOrderer>[] = [];

    /**
     * @param orderer - instance of in-memory orderer for the manager to provide
     */
    constructor(private orderer: LocalOrderManager) {
    }

    /**
     * Returns the op orderer for the given tenant ID and document ID
     * using the local in-memory orderer manager instance.
     * @param tenantId - ID of tenant
     * @param documentId - ID of document
     */
    public getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        const p = this.orderer.get(tenantId, documentId);
        this.orderersP.push(p);
        return p;
    }

    /**
     * Returns true if there are any received ops that are not yet ordered.
     */
    public async hasPendingWork(): Promise<boolean> {
        return Promise.all(this.orderersP).then((orderers) => {
            for (const orderer of orderers) {
                // We know that it ia LocalOrderer, break the abstraction
                if ((orderer as LocalOrderer).hasPendingWork()) {
                    return true;
                }
            }
            return false;
        });
    }
}

/**
 * Implementation of delta connection server for testing.
 */
export class TestDeltaConnectionServer implements ITestDeltaConnectionServer {
    /**
     * Creates and returns a delta connection server for testing.
     */
    public static create(testDbFactory: ITestDbFactory = new TestDbFactory({})): ITestDeltaConnectionServer {
        const nodesCollectionName = "nodes";
        const documentsCollectionName = "documents";
        const deltasCollectionName = "deltas";
        const reservationsCollectionName = "reservations";
        const scribeDeltasCollectionName = "scribeDeltas";

        const webSocketServer = new TestWebSocketServer();
        const mongoManager = new MongoManager(testDbFactory);
        const testTenantManager = new TestTenantManager();

        const databaseManager = new MongoDatabaseManager(
            mongoManager,
            nodesCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            scribeDeltasCollectionName);

        const testStorage = new TestDocumentStorage(
            databaseManager,
            testTenantManager);

        const nodeFactory = new LocalNodeFactory(
            "os",
            "http://localhost:4000", // unused placeholder url
            testStorage,
            databaseManager,
            60000,
            () => webSocketServer,
            new TestTaskMessageSender(),
            testTenantManager,
            {},
            16 * 1024);

        const reservationManager = new TestReservationManager(
            nodeFactory,
            mongoManager,
            reservationsCollectionName);

        const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
        const testOrderer = new TestOrderManager(localOrderManager);

        register(
            webSocketServer,
            testOrderer,
            testTenantManager,
            testStorage,
            testDbFactory);

        return new TestDeltaConnectionServer(webSocketServer, databaseManager, testOrderer, testDbFactory);
    }

    private constructor(
        public webSocketServer: IWebSocketServer,
        public databaseManager: IDatabaseManager,
        private testOrdererManager: TestOrderManager,
        public testDbFactory: ITestDbFactory) { }

    /**
     * Returns true if there are any received ops that are not yet ordered.
     */
    public async hasPendingWork(): Promise<boolean> {
        return this.testOrdererManager.hasPendingWork();
    }
}

/**
 * Registers listeners to web socket server events for handling connection,
 * ops, and signals.
 * @param webSocketServer - web socket server to listen to
 * @param orderManager - instance of op ordering manager
 * @param tenantManager - instance of tenant manager
 * @param contentCollection - collection of any op content
 */
// Forked from io.ts in alfred, which has service dependencies and cannot run in a browser.
// Further simplifications are likely possible.
// tslint:disable:no-unsafe-any
export function register(
    webSocketServer: IWebSocketServer,
    orderManager: IOrdererManager,
    tenantManager: ITenantManager,
    storage: IDocumentStorage,
    dbFactory: ITestDbFactory) {

    const contentCollection = dbFactory.testDatabase.collection("ops");
    const socketList: IWebSocket[] = [];
    webSocketServer.on("connection", (socket: IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, IOrdererConnection>();
        // Map from client IDs to room.
        const roomMap = new Map<string, string>();

        function isWriter(scopes: string[], existing: boolean, mode: ConnectionMode): boolean {
            return true;
        }

        socketList.push(socket);
        async function connectDocument(message: IConnect): Promise<IConnected> {
            // Validate token signature and claims
            const token = message.token;
            const claims = jwt.decode(token) as ITokenClaims;
            if (claims.documentId !== message.id || claims.tenantId !== message.tenantId) {
                return Promise.reject("Invalid claims");
            }
            await tenantManager.verifyToken(claims.tenantId, token);

            const clientId = `${randomName.first()}-${randomName.last()}`;

            const messageClient: Partial<IClient> = message.client ? message.client : {};
            messageClient.user = claims.user;
            messageClient.scopes = claims.scopes;

            // Join the room to receive signals.
            roomMap.set(clientId, `${claims.tenantId}/${claims.documentId}`);

            // Iterate over the version ranges provided by the client and select the best one that works
            const connectVersions = message.versions ? message.versions : ["^0.1.0"];
            let version: string = null;
            for (const connectVersion of connectVersions) {
                if (semver.intersects(protocolVersion, connectVersion)) {
                    version = protocolVersion;
                    break;
                }
            }

            if (!version) {
                return Promise.reject(
                    `Unsupported client protocol.` +
                    `Server: ${protocolVersion}. ` +
                    `Client: ${JSON.stringify(connectVersions)}`);
            }

            const details = await storage.getOrCreateDocument(claims.tenantId, claims.documentId);
            if (isWriter(messageClient.scopes, details.existing, message.mode)) {
                const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
                const connection = await orderer.connect(socket, clientId, messageClient as IClient, details);
                connectionsMap.set(clientId, connection);

                const connectedMessage: IConnected = {
                    claims,
                    clientId,
                    existing: details.existing,
                    maxMessageSize: connection.maxMessageSize,
                    mode: "write",
                    parentBranch: connection.parentBranch,
                    serviceConfiguration: connection.serviceConfiguration,
                    supportedVersions: [protocolVersion],
                    version,
                };

                return connectedMessage;
            } else {
                const connectedMessage: IConnected = {
                    claims,
                    clientId,
                    existing: details.existing,
                    maxMessageSize: 1024, // Readonly client can't send ops.
                    mode: "read",
                    parentBranch: null, // Does not matter for now.
                    serviceConfiguration: {
                        blockSize: 64436,
                        maxMessageSize:  16 * 1024,
                        summary: {
                            idleTime: 5000,
                            maxOps: 1000,
                            maxTime: 5000 * 12,
                            maxAckWaitTime: 600000,
                        },
                    },
                    supportedVersions: [protocolVersion],
                    version,
                };

                return connectedMessage;
            }
        }

        // Note connect is a reserved socket.io word so we use connect_document to represent the connect request
        socket.on("connect_document", async (message: IConnect) => {
            connectDocument(message).then(
                (connectedMessage) => {
                    socket.emit("connect_document_success", connectedMessage);
                },
                (error) => {
                    socket.emit("connect_document_error", error);
                });
        });

        // Message sent when a new operation is submitted to the router
        socket.on(
            "submitOp",
            (clientId: string, messageBatches: (IDocumentMessage | IDocumentMessage[])[], response) => {
                // Verify the user has connected on this object id
                if (!connectionsMap.has(clientId)) {
                    return response("Invalid client ID", null);
                }

                const connection = connectionsMap.get(clientId);

                messageBatches.forEach((messageBatch) => {
                    const messages = Array.isArray(messageBatch) ? messageBatch : [messageBatch];
                    const filtered = messages
                        .filter((message) => message.type !== MessageType.RoundTrip);

                    if (filtered.length > 0) {
                        connection.order(filtered);
                    }
                });

                // A response callback used to be used to verify the send. Newer drivers do not use this. Will be
                // removed in 0.9
                if (response) {
                    response(null);
                }
            });

        // Message sent when a new splitted operation is submitted to the router
        socket.on("submitContent", (clientId: string, message: IDocumentMessage, response) => {
            // Verify the user has connected on this object id
            if (!connectionsMap.has(clientId) || !roomMap.has(clientId)) {
                return response("Invalid client ID", null);
            }

            const broadCastMessage: IContentMessage = {
                clientId,
                clientSequenceNumber: message.clientSequenceNumber,
                contents: message.contents,
            };

            const connection = connectionsMap.get(clientId);

            const dbMessage = {
                clientId,
                documentId: connection.documentId,
                op: broadCastMessage,
                tenantId: connection.tenantId,
            };

            contentCollection.insertOne(dbMessage).then(() => {
                socketList.forEach((webSocket: IWebSocket) => {
                    webSocket.emit("op-content", broadCastMessage);
                });
                return response(null);
            }, (error) => {
                if (error.code !== 11000) {
                    return response("Could not write to DB", null);
                }
            });
        });

        // Message sent when a new signal is submitted to the router
        socket.on("submitSignal", (clientId: string, contents: any[], response) => {
            // Verify the user has connected on this object id
            if (!roomMap.has(clientId)) {
                return response("Invalid client ID", null);
            }

            for (const content of contents) {
                socketList.forEach((webSocket: IWebSocket) => {
                    const signalMessage: ISignalMessage = {
                        clientId,
                        content,
                    };
                    webSocket.emit("signal", signalMessage);
                });
            }

            response(null);
        });

        socket.on("disconnect", () => {
            // Send notification messages for all client IDs in the connection map
            for (const connection of connectionsMap.values()) {
                connection.disconnect();
            }
        });
    });
}
