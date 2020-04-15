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
} from "@microsoft/fluid-server-services-core";
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
} from "@microsoft/fluid-server-test-utils";
import { configureWebSocketServices} from "@microsoft/fluid-server-lambdas";
import { MemoryOrdererManager } from "./memoryOrdererManager";

/**
 * Items needed for handling deltas.
 */
export interface ILocalDeltaConnectionServer {
    webSocketServer: IWebSocketServer;
    databaseManager: IDatabaseManager;
    testDbFactory: ITestDbFactory;
    hasPendingWork(): Promise<boolean>;
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

        const testOrderer = new MemoryOrdererManager(
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
            testOrderer,
            testTenantManager,
            testStorage,
            testDbFactory.testDatabase.collection("ops"),
            new TestClientManager(),
            new DefaultMetricClient(),
            logger);

        return new LocalDeltaConnectionServer(
            webSocketServer,
            databaseManager,
            testOrderer,
            testDbFactory,
            testStorage);
    }

    private constructor(
        public webSocketServer: IWebSocketServer,
        public databaseManager: IDatabaseManager,
        private readonly testOrdererManager: MemoryOrdererManager,
        public testDbFactory: ITestDbFactory,
        public documentStorage: IDocumentStorage) { }

    /**
     * Returns true if there are any received ops that are not yet ordered.
     */
    public async hasPendingWork(): Promise<boolean> {
        return this.testOrdererManager.hasPendingWork();
    }
}
