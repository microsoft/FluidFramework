import { RoundTrip } from "@prague/client-api";
import {
    IClient,
    IContentMessage,
    IDocumentMessage,
    ISignalMessage,
    ITokenClaims,
} from "@prague/container-definitions";
import {
    LocalNodeFactory,
    LocalOrderer,
    LocalOrderManager,
    NodeManager,
    ReservationManager,
} from "@prague/memory-orderer";
import {
    ICollection,
    IDatabaseManager,
    IOrderer,
    IOrdererConnection,
    IOrdererManager,
    ITenantManager,
    IWebSocket,
    IWebSocketServer,
    MongoDatabaseManager,
    MongoManager,
} from "@prague/services-core";
import { IConnect, IConnected } from "@prague/socket-storage-shared";
import {
    TestCollection,
    TestDbFactory,
    TestDocumentStorage,
    TestTaskMessageSender,
    TestTenantManager,
    TestWebSocketServer,
} from "@prague/test-utils";
import * as jwt from "jsonwebtoken";
import * as randomName from "random-name";
import * as semver from "semver";

const protocolVersion = "^0.1.0";

export interface ITestDeltaConnectionServer {
    webSocketServer: IWebSocketServer;
    databaseManager: IDatabaseManager;

    hasPendingWork(): Promise<boolean>;
}

class TestOrderManager implements IOrdererManager {
    private readonly orderersP = new Array<Promise<IOrderer>>();

    constructor(private orderer: LocalOrderManager) {
    }

    public getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        const p = this.orderer.get(tenantId, documentId);
        this.orderersP.push(p);
        return p;
    }

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

export class TestDeltaConnectionServer implements ITestDeltaConnectionServer {
    public static Create(): ITestDeltaConnectionServer {
        const nodesCollectionName = "nodes";
        const documentsCollectionName = "documents";
        const deltasCollectionName = "deltas";
        const reservationsCollectionName = "reservations";
        const testData: { [key: string]: any[] } = {};

        const webSocketServer = new TestWebSocketServer();
        const testDbFactory = new TestDbFactory(testData);
        const mongoManager = new MongoManager(testDbFactory);
        const testTenantManager = new TestTenantManager();

        const databaseManager = new MongoDatabaseManager(
            mongoManager,
            nodesCollectionName,
            documentsCollectionName,
            deltasCollectionName);

        const testStorage = new TestDocumentStorage(
            databaseManager,
            testTenantManager);

        const nodeManager = new NodeManager(mongoManager, nodesCollectionName);
        const reservationManager = new ReservationManager(
            nodeManager,
            mongoManager,
            reservationsCollectionName);

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
        const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
        const testOrderer = new TestOrderManager(localOrderManager);
        const testCollection = new TestCollection([]);

        register(
            webSocketServer,
            testOrderer,
            testTenantManager,
            testCollection);

        return new TestDeltaConnectionServer(webSocketServer, databaseManager, testOrderer);
    }

    private constructor(
        public webSocketServer: IWebSocketServer,
        public databaseManager: IDatabaseManager,
        private testOrdererManager: TestOrderManager) { }

    public async hasPendingWork(): Promise<boolean> {
        return this.testOrdererManager.hasPendingWork();
    }
}

// Forked from io.ts in alfred, which has service dependencies and cannot run in a browser.
// Further simplifications are likely possible.
// tslint:disable:no-unsafe-any
export function register(
    webSocketServer: IWebSocketServer,
    orderManager: IOrdererManager,
    tenantManager: ITenantManager,
    contentCollection: ICollection<any>) {

    webSocketServer.on("connection", (socket: IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, IOrdererConnection>();
        // Map from client IDs to room.
        const roomMap = new Map<string, string>();

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

            // Readonly clients don't need an orderer.
            if (messageClient.mode !== "readonly") {
                const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
                const connection = await orderer.connect(socket, clientId, messageClient as IClient);
                connectionsMap.set(clientId, connection);

                const connectedMessage: IConnected = {
                    clientId,
                    existing: connection.existing,
                    maxMessageSize: connection.maxMessageSize,
                    parentBranch: connection.parentBranch,
                    supportedVersions: [protocolVersion],
                    version,
                };

                return connectedMessage;
            } else {
                // Todo (mdaumi): We should split storage stuff from orderer to get the following fields right.
                const connectedMessage: IConnected = {
                    clientId,
                    existing: true, // Readonly client can only open an existing document.
                    maxMessageSize: 1024, // Readonly client can't send ops.
                    parentBranch: null, // Does not matter for now.
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
        socket.on("submitOp", (clientId: string, messages: IDocumentMessage[], response) => {
            // Verify the user has connected on this object id
            if (!connectionsMap.has(clientId)) {
                return response("Invalid client ID", null);
            }

            const connection = connectionsMap.get(clientId);
            for (const message of messages) {
                if (message.type === RoundTrip) {
                    // do nothing
                } else {
                    // need to sanitize message?
                    connection.order(message);
                }
            }

            response(null);
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
                socket.broadcastToRoom(roomMap.get(clientId), "op-content", broadCastMessage);
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

            const roomId = roomMap.get(clientId);

            for (const content of contents) {
                const signalMessage: ISignalMessage = {
                    clientId,
                    content,
                };

                socket.emitToRoom(roomId, "signal", signalMessage);
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
