/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    LocalNodeFactory,
    LocalOrderer,
    LocalOrderManager,
} from "@microsoft/fluid-server-memory-orderer";
import {
    DefaultMetricClient,
    IDatabaseManager,
    IOrderer,
    IOrdererManager,
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
    TestClientManager,
} from "@microsoft/fluid-server-test-utils";
import { configureWebSocketServices} from "@microsoft/fluid-server-lambdas";
import * as winston from "winston";
import { TestReservationManager } from "./testReservationManager";

winston.configure({
    transports: [
        new winston.transports.Console(),
    ],
});

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
    constructor(private readonly orderer: LocalOrderManager) {
    }

    /**
     * Returns the op orderer for the given tenant ID and document ID
     * using the local in-memory orderer manager instance.
     * @param tenantId - ID of tenant
     * @param documentId - ID of document
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
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
            "http://localhost:4000", // Unused placeholder url
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

        configureWebSocketServices(
            webSocketServer,
            testOrderer,
            testTenantManager,
            testStorage,
            testDbFactory.testDatabase.collection("ops"),
            new TestClientManager(),
            new DefaultMetricClient());

        return new TestDeltaConnectionServer(webSocketServer, databaseManager, testOrderer, testDbFactory);
    }

    private constructor(
        public webSocketServer: IWebSocketServer,
        public databaseManager: IDatabaseManager,
        private readonly testOrdererManager: TestOrderManager,
        public testDbFactory: ITestDbFactory) { }

    /**
     * Returns true if there are any received ops that are not yet ordered.
     */
    public async hasPendingWork(): Promise<boolean> {
        return this.testOrdererManager.hasPendingWork();
    }
}
