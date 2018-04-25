import * as nconf from "nconf";
import * as path from "path";
import * as supertest from "supertest";
import * as app from "../../alfred/app";
import { MongoManager } from "../../utils";
import { TestDbFactory, TestKafka, TestTenantManager } from "../testUtils";

const defaultConfig = nconf.file(path.join(__dirname, "../../../config.test.json")).use("memory");

describe("Routerlicious", () => {
    describe("Alfred", () => {
        describe("Server", () => {
            let testServer: supertest.SuperTest<supertest.Test>;
            let testKafka: TestKafka;

            beforeEach(() => {
                const testData = {
                    deltas: [],
                };

                const testDbFactory = new TestDbFactory(testData);
                const mongoManager = new MongoManager(testDbFactory);
                const testTenantManager = new TestTenantManager();
                testKafka = new TestKafka();
                const alfred = app.create(
                    defaultConfig,
                    testTenantManager,
                    [{ id: "git", key: "git" }],
                    mongoManager,
                    testKafka.createProducer());
                testServer = supertest(alfred);
            });

            describe("Routes", () => {
                describe("Canvas", () => {
                    it("Should be able to retrieve document", () => {
                        return testServer.get("/canvas/test").expect(200);
                    });

                    it("Should be called with a document id", () => {
                        return testServer.get("/canvas").expect(404);
                    });
                });

                describe("Cell", () => {
                    it("Should be able to retrieve document", () => {
                        return testServer.get("/cell/test").expect(200);
                    });

                    it("Should be called with a document id", () => {
                        return testServer.get("/cell").expect(404);
                    });
                });

                describe("Deltas", () => {
                    it("Should be able to retrieve all deltas", () => {
                        return testServer.get("/deltas/test").expect(200);
                    });

                    it("Should be called with a document id", () => {
                        return testServer.get("/deltas").expect(404);
                    });
                });

                describe("DemoCreator", () => {
                    it("Should return page", () => {
                        return testServer.get("/democreator").expect(200);
                    });
                });

                describe("Home", () => {
                    it("Should return page", () => {
                        return testServer.get("/").expect(200);
                    });
                });

                describe("Intelligence", () => {
                    // TODO add in
                });

                describe("Login", () => {
                    it("Should return page", () => {
                        return testServer.get("/").expect(200);
                    });
                });

                describe("Maps", () => {
                    it("Should be able to retrieve document", () => {
                        return testServer.get("/maps/test").expect(200);
                    });

                    it("Should be called with a document id", () => {
                        return testServer.get("/maps").expect(404);
                    });
                });

                describe("Scribe", () => {
                    it("Should return page", () => {
                        return testServer.get("/scribe").expect(200);
                    });
                });

                describe("SharedText", () => {
                    it("Should be able to retrieve document", () => {
                        return testServer.get("/sharedText/test").expect(200);
                    });

                    it("Should be called with a document id", () => {
                        return testServer.get("/sharedText").expect(404);
                    });
                });
            });
        });
    });
});
