import { LocalNodeFactory, LocalOrderManager, NodeManager, ReservationManager } from "@prague/memory-orderer";
// tslint:disable:no-submodule-imports
import * as io from "@prague/routerlicious/dist/alfred/io";
import * as services from "@prague/services";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
import {
    TestCollection,
    TestDbFactory,
    TestKafka,
    TestTaskMessageSender,
    TestTenantManager,
    TestWebSocketServer,
} from "@prague/test-utils";

export interface ITestDeltaConnectionServer {
    webSocketServer: core.IWebSocketServer;
    databaseManager: core.IDatabaseManager;
}

class TestOrderManager implements core.IOrdererManager {
    constructor(private orderer: LocalOrderManager) {
    }

    public getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        return this.orderer.get(tenantId, documentId);
    }
}

export class TestDeltaConnectionServer implements ITestDeltaConnectionServer {
    public static Create(): ITestDeltaConnectionServer {
        const nodesCollectionName = "nodes";
        const documentsCollectionName = "documents";
        const deltasCollectionName = "deltas";
        const reservationsCollectionName = "reservations";
        const metricClientConfig = {};
        const testData: { [key: string]: any[] } = {};

        const webSocketServer = new TestWebSocketServer();
        const testDbFactory = new TestDbFactory(testData);
        const mongoManager = new utils.MongoManager(testDbFactory);
        const testTenantManager = new TestTenantManager();

        const deliKafka = new TestKafka();
        const producer = deliKafka.createProducer();
        const databaseManager = new utils.MongoDatabaseManager(
            mongoManager,
            nodesCollectionName,
            documentsCollectionName,
            deltasCollectionName);
        const testStorage = new services.DocumentStorage(
            databaseManager,
            testTenantManager,
            producer);

        const nodeManager = new NodeManager(mongoManager, nodesCollectionName);
        const reservationManager = new ReservationManager(
            nodeManager,
            mongoManager,
            reservationsCollectionName);

        const nodeFactory = new LocalNodeFactory(
            "os",
            "http://localhost:4000",
            testStorage,
            databaseManager,
            60000,
            new TestTaskMessageSender(),
            testTenantManager,
            {},
            16 * 1024);
        const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
        const testOrderer = new TestOrderManager(localOrderManager);

        const testCollection = new TestCollection([]);

        io.register(
            webSocketServer,
            metricClientConfig,
            testOrderer,
            testTenantManager,
            testCollection);

        return new TestDeltaConnectionServer(webSocketServer, databaseManager);
    }

    constructor(
        public webSocketServer: core.IWebSocketServer,
        public databaseManager: core.IDatabaseManager) {}
}
