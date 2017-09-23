import * as assert from "assert";
import * as nconf from "nconf";
import * as path from "path";
import * as io from "../../alfred/io";
import { MongoManager } from "../../utils";
import { TestDbFactory, TestKafka, TestWebSocketServer } from "../testUtils";

const defaultConfig = nconf.file(path.join(__dirname, "../../../config.test.json")).use("memory");

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("Server", () => {
            describe("WebSockets", () => {
                let webSocketServer: TestWebSocketServer;

                beforeEach(() => {
                    const documentsCollectionName = "test";
                    const testId = "test";
                    const testData: { [key: string]: any[] } = {};
                    testData[documentsCollectionName] = [{ _id: testId }];

                    const testDbFactory = new TestDbFactory(testData);
                    const mongoManager = new MongoManager(testDbFactory);
                    const deliKafka = new TestKafka();
                    const producer = deliKafka.createProducer();

                    webSocketServer = new TestWebSocketServer();

                    io.register(webSocketServer, defaultConfig, mongoManager, producer, documentsCollectionName);
                });

                it("Can connect to the web socket server", () => {
                    assert.ok(true);
                });
            });
        });
    });
});
