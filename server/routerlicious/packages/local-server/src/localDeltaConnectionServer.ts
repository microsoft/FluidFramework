/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DefaultMetricClient,
    IDatabaseManager,
    IDocumentStorage,
    IWebSocketServer,
    MongoDatabaseManager,
    MongoManager,
    ILogger,
    IWebSocket,
} from "@fluidframework/server-services-core";
import {
    ITestDbFactory,
    TestDbFactory,
    TestDocumentStorage,
    TestTenantManager,
    TestWebSocketServer,
    TestClientManager,
    DebugLogger,
    TestHistorian,
    TestTaskMessageSender,
} from "@fluidframework/server-test-utils";
import { configureWebSocketServices } from "@fluidframework/server-lambdas";
import {
    IClient,
    IConnected,
    IConnect,
    ISequencedDocumentMessage,
    IContentMessage,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";
import { MemoryOrdererManager } from "./memoryOrdererManager";

/**
 * Items needed for handling deltas.
 */
export interface ILocalDeltaConnectionServer {
    webSocketServer: IWebSocketServer;
    databaseManager: IDatabaseManager;
    testDbFactory: ITestDbFactory;
    hasPendingWork(): Promise<boolean>;
    connectWebSocket(
        tenantId: string,
        documentId: string,
        token: string,
        client: IClient,
        protocolVersions: string[]): [IWebSocket, Promise<IConnected>];
}

/**
 * Implementation of local delta connection server.
 */
export class LocalDeltaConnectionServer implements ILocalDeltaConnectionServer {
    /**
     * Creates and returns a local delta connection server.
     */
    public static create(testDbFactory: ITestDbFactory = new TestDbFactory({})): ILocalDeltaConnectionServer {
        const nodesCollectionName = "nodes";
        const documentsCollectionName = "documents";
        const deltasCollectionName = "deltas";
        const scribeDeltasCollectionName = "scribeDeltas";

        const webSocketServer = new TestWebSocketServer();
        const mongoManager = new MongoManager(testDbFactory);
        const testTenantManager = new TestTenantManager(undefined, undefined, testDbFactory.testDatabase);

        const databaseManager = new MongoDatabaseManager(
            mongoManager,
            nodesCollectionName,
            documentsCollectionName,
            deltasCollectionName,
            scribeDeltasCollectionName);

        const testStorage = new TestDocumentStorage(
            databaseManager,
            testTenantManager);

        const logger = DebugLogger.create("fluid-server:LocalDeltaConnectionServer");

        const ordererManager = new MemoryOrdererManager(
            testStorage,
            databaseManager,
            testTenantManager,
            new TestTaskMessageSender(),
            {},
            16 * 1024,
            async () => new TestHistorian(testDbFactory.testDatabase),
            logger);

        configureWebSocketServices(
            webSocketServer,
            ordererManager,
            testTenantManager,
            testStorage,
            testDbFactory.testDatabase.collection("ops"),
            new TestClientManager(),
            new DefaultMetricClient(),
            logger);

        return new LocalDeltaConnectionServer(
            webSocketServer,
            databaseManager,
            ordererManager,
            testDbFactory,
            testStorage,
            logger);
    }

    private constructor(
        public webSocketServer: TestWebSocketServer,
        public databaseManager: IDatabaseManager,
        private readonly ordererManager: MemoryOrdererManager,
        public testDbFactory: ITestDbFactory,
        public documentStorage: IDocumentStorage,
        private readonly logger: ILogger) { }

    /**
     * Returns true if there are any received ops that are not yet ordered.
     */
    public async hasPendingWork(): Promise<boolean> {
        return this.ordererManager.hasPendingWork();
    }

    public connectWebSocket(
        tenantId: string,
        documentId: string,
        token: string,
        client: IClient,
        protocolVersions: string[]): [IWebSocket, Promise<IConnected>] {
        const socket = this.webSocketServer.createConnection();

        const connectMessage: IConnect = {
            client,
            id: documentId,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: protocolVersions,
        };

        const connectedP = new Promise<IConnected>((resolve, reject) => {
            // Listen for ops sent before we receive a response to connect_document
            const queuedMessages: ISequencedDocumentMessage[] = [];
            const queuedContents: IContentMessage[] = [];
            const queuedSignals: ISignalMessage[] = [];

            const earlyOpHandler = (docId: string, msgs: ISequencedDocumentMessage[]) => {
                this.logger.info(`Queued early ops: ${msgs.length}`);
                queuedMessages.push(...msgs);
            };
            socket.on("op", earlyOpHandler);

            const earlyContentHandler = (msg: IContentMessage) => {
                this.logger.info("Queued early contents");
                queuedContents.push(msg);
            };
            socket.on("op-content", earlyContentHandler);

            const earlySignalHandler = (msg: ISignalMessage) => {
                this.logger.info("Queued early signals");
                queuedSignals.push(msg);
            };
            socket.on("signal", earlySignalHandler);

            // Listen for connection issues
            socket.on("connect_error", (error) => {
                reject(error);
            });

            socket.on("connect_document_success", (response: IConnected) => {
                socket.removeListener("op", earlyOpHandler);
                socket.removeListener("op-content", earlyContentHandler);
                socket.removeListener("signal", earlySignalHandler);

                /* Issue #1566: Backward compat */
                if (response.initialMessages === undefined) {
                    response.initialMessages = [];
                }
                if (response.initialClients === undefined) {
                    response.initialClients = [];
                }
                if (response.initialContents === undefined) {
                    response.initialContents = [];
                }
                if (response.initialSignals === undefined) {
                    response.initialSignals = [];
                }

                if (queuedMessages.length > 0) {
                    // Some messages were queued.
                    // add them to the list of initialMessages to be processed
                    response.initialMessages.push(...queuedMessages);
                    response.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                }

                if (queuedContents.length > 0) {
                    // Some contents were queued.
                    // add them to the list of initialContents to be processed
                    response.initialContents.push(...queuedContents);

                    // eslint-disable-next-line max-len, @typescript-eslint/strict-boolean-expressions
                    response.initialContents.sort((a, b) => (a.clientId === b.clientId) ? 0 : ((a.clientId < b.clientId) ? -1 : 1) || a.clientSequenceNumber - b.clientSequenceNumber);
                }

                if (queuedSignals.length > 0) {
                    // Some signals were queued.
                    // add them to the list of initialSignals to be processed
                    response.initialSignals.push(...queuedSignals);
                }

                resolve(response);
            });

            socket.on("connect_document_error", reject);

            socket.emit("connect_document", connectMessage);
        });

        return [socket, connectedP];
    }
}
