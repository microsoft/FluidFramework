// tslint:disable:no-submodule-imports
import * as io from "@prague/routerlicious/dist/alfred/io";
import * as core from "@prague/routerlicious/dist/core";
import * as services from "@prague/routerlicious/dist/services";
import {
    TestCollection,
    TestDbFactory,
    TestKafka,
    TestTaskMessageSender,
    TestTenantManager,
    TestWebSocketServer,
} from "@prague/routerlicious/dist/test/testUtils";
import * as utils from "@prague/routerlicious/dist/utils";
// tslint:enable:no-submodule-imports

export interface ITestDeltaConnectionServer {
    webSocketServer: core.IWebSocketServer;
    databaseManager: core.IDatabaseManager;
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

        const nodeManager = new services.NodeManager(mongoManager, nodesCollectionName);
        const reservationManager = new services.ReservationManager(
            nodeManager,
            mongoManager,
            reservationsCollectionName);

        const nodeFactory = new services.LocalNodeFactory(
            "os",
            "http://localhost:4000",
            testStorage,
            databaseManager,
            60000,
            new TestTaskMessageSender(),
            testTenantManager,
            {},
            16 * 1024);
        const localOrderManager = new services.LocalOrderManager(nodeFactory, reservationManager);
        const testOrderer = new services.OrdererManager(localOrderManager);

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
