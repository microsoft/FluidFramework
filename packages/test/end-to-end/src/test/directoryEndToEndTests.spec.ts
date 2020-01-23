/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as api from "@fluid-internal/client-api";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    DocumentDeltaEventManager,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { ISharedDirectory, ISharedMap, SharedDirectory, SharedMap } from "@microsoft/fluid-map";
import { MessageType } from "@microsoft/fluid-protocol-definitions";

describe("Directory", () => {
    const id = "fluid://test.com/test/test";
    const directoryId = "testDirectory";

    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let documentDeltaEventManager: DocumentDeltaEventManager;
    let user1Document: api.Document;
    let user2Document: api.Document;
    let user3Document: api.Document;
    let root1Directory: ISharedDirectory;
    let root2Directory: ISharedDirectory;
    let root3Directory: ISharedDirectory;

    beforeEach(async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.create();
        documentDeltaEventManager = new DocumentDeltaEventManager(testDeltaConnectionServer);
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        const resolver = new TestResolver();
        user1Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user1Document);

        user2Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user2Document);

        user3Document = await api.load(
            id, resolver, {}, serviceFactory);
        documentDeltaEventManager.registerDocuments(user3Document);
        await documentDeltaEventManager.pauseProcessing();

        // Create a directory on the root and propagate it to other documents
        const directory = SharedDirectory.create(user1Document.runtime);
        user1Document.getRoot().set(directoryId, directory.handle);
        await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

        root1Directory = await user1Document.getRoot().get<IComponentHandle>(directoryId).get<ISharedDirectory>();
        root2Directory = await user2Document.getRoot().get<IComponentHandle>(directoryId).get<ISharedDirectory>();
        root3Directory = await user3Document.getRoot().get<IComponentHandle>(directoryId).get<ISharedDirectory>();
    });

    function expectAllValues(msg, key, path, value1, value2, value3) {
        const user1Value = root1Directory.getWorkingDirectory(path).get(key);
        assert.equal(user1Value, value1, `Incorrect value for ${key} in document 1 ${msg}`);
        const user2Value = root2Directory.getWorkingDirectory(path).get(key);
        assert.equal(user2Value, value2, `Incorrect value for ${key} in document 2 ${msg}`);
        const user3Value = root3Directory.getWorkingDirectory(path).get(key);
        assert.equal(user3Value, value3, `Incorrect value for ${key} in document 3 ${msg}`);
    }
    function expectAllBeforeValues(key, path, value1, value2, value3) {
        expectAllValues("before process", key, path, value1, value2, value3);
    }
    function expectAllAfterValues(key, path, value) {
        expectAllValues("after process", key, path, value, value, value);
    }

    function expectAllSize(size: number, path?: string) {
        /* eslint-disable @typescript-eslint/strict-boolean-expressions */
        const dir1 = path ? root1Directory.getWorkingDirectory(path) : root1Directory;
        const dir2 = path ? root2Directory.getWorkingDirectory(path) : root2Directory;
        const dir3 = path ? root3Directory.getWorkingDirectory(path) : root3Directory;
        /* eslint-enable @typescript-eslint/strict-boolean-expressions */

        const keys1 = Array.from(dir1.keys());
        assert.equal(keys1.length, size, "Incorrect number of Keys in document1");
        const keys2 = Array.from(dir2.keys());
        assert.equal(keys2.length, size, "Incorrect number of Keys in document2");
        const keys3 = Array.from(dir3.keys());
        assert.equal(keys3.length, size, "Incorrect number of Keys in document3");

        assert.equal(dir1.size, size, "Incorrect map size in document1");
        assert.equal(dir2.size, size, "Incorrect map size in document2");
        assert.equal(dir3.size, size, "Incorrect map size in document3");
    }

    describe("Smoke test", () => {
        it("should create the directory in 3 documents correctly", async () => {
            // Directory was created in beforeEach
            assert.ok(root1Directory, `Couldn't find the directory in root1, instead got ${root1Directory}`);
            assert.ok(root2Directory, `Couldn't find the directory in root2, instead got ${root2Directory}`);
            assert.ok(root3Directory, `Couldn't find the directory in root3, instead got ${root3Directory}`);
        });

        it("should set a key in the directory in three documents correctly", async () => {
            root1Directory.set("testKey1", "testValue1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "/", "testValue1");
        });
    });

    describe("Root operations", () => {
        beforeEach("Populate with a value under the root", async () => {
            root1Directory.set("testKey1", "testValue1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "/", "testValue1");
        });

        it("should delete a value in 3 documents correctly", async () => {
            root2Directory.delete("testKey1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            const hasKey1 = root1Directory.has("testKey1");
            assert.equal(hasKey1, false, "testKey1 not deleted in document 1");

            const hasKey2 = root2Directory.has("testKey1");
            assert.equal(hasKey2, false, "testKey1 not deleted in document 1");

            const hasKey3 = root3Directory.has("testKey1");
            assert.equal(hasKey3, false, "testKey1 not deleted in document 1");
        });

        it("should have the correct size in three documents", async () => {
            root3Directory.set("testKey3", true);
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            // check the number of keys in the map (2 keys set)
            expectAllSize(2);
        });

        it("should set key value to undefined in three documents correctly", async () => {
            root2Directory.set("testKey1", undefined);
            root2Directory.set("testKey2", undefined);
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "/", undefined);
            expectAllAfterValues("testKey2", "/", undefined);
        });

        it("should update value and trigger onValueChanged on other two documents", async () => {
            let user1ValueChangedCount: number = 0;
            let user2ValueChangedCount: number = 0;
            let user3ValueChangedCount: number = 0;
            root1Directory.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 1");
                        user1ValueChangedCount = user1ValueChangedCount + 1;
                    }
                }
            });
            root2Directory.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 2");
                        user2ValueChangedCount = user2ValueChangedCount + 1;
                    }
                }
            });
            root3Directory.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in document 3");
                        user3ValueChangedCount = user3ValueChangedCount + 1;
                    }
                }
            });

            root1Directory.set("testKey1", "updatedValue");

            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in document 1");
            assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 2");
            assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 3");

            expectAllAfterValues("testKey1", "/", "updatedValue");
        });

        describe("Eventual consistency after simultaneous operations", () => {
            it("set/set", async () => {
                root1Directory.set("testKey1", "value1");
                root2Directory.set("testKey1", "value2");
                root3Directory.set("testKey1", "value0");
                root3Directory.set("testKey1", "value3");

                expectAllBeforeValues("testKey1", "/", "value1", "value2", "value3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey1", "/", "value3");
            });

            it("delete/set", async () => {
                // set after delete
                root1Directory.set("testKey1", "value1.1");
                root2Directory.delete("testKey1");
                root3Directory.set("testKey1", "value1.3");

                expectAllBeforeValues("testKey1", "/", "value1.1", undefined, "value1.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey1", "/", "value1.3");
            });

            it("delete/set from the same document", async () => {
                // delete and then set on the same document
                root1Directory.set("testKey2", "value2.1");
                root2Directory.delete("testKey2");
                root3Directory.set("testKey2", "value2.3");
                // drain the outgoing so that the next set will come after
                await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
                root2Directory.set("testKey2", "value2.2");

                expectAllBeforeValues("testKey2", "/", "value2.1", "value2.2", "value2.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey2", "/", "value2.2");
            });

            it("set/delete", async () => {
                // delete after set
                root1Directory.set("testKey3", "value3.1");
                root2Directory.set("testKey3", "value3.2");
                root3Directory.delete("testKey3");

                expectAllBeforeValues("testKey3", "/", "value3.1", "value3.2", undefined);
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey3", "/", undefined);
            });

            it("set/clear", async () => {
                // clear after set
                root1Directory.set("testKey1", "value1.1");
                root2Directory.set("testKey1", "value1.2");
                root3Directory.clear();
                expectAllBeforeValues("testKey1", "/", "value1.1", "value1.2", undefined);
                assert.equal(root3Directory.size, 0, "Incorrect map size after clear");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey1", "/", undefined);
                expectAllSize(0);
            });

            it("clear/set on the same document", async () => {
                // set after clear on the same map
                root1Directory.set("testKey2", "value2.1");
                root2Directory.clear();
                root3Directory.set("testKey2", "value2.3");
                // drain the outgoing so that the next set will come after
                await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
                root2Directory.set("testKey2", "value2.2");
                expectAllBeforeValues("testKey2", "/", "value2.1", "value2.2", "value2.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey2", "/", "value2.2");
                expectAllSize(1);
            });

            it("clear/set", async () => {
                // set after clear
                root1Directory.set("testKey3", "value3.1");
                root2Directory.clear();
                root3Directory.set("testKey3", "value3.3");
                expectAllBeforeValues("testKey3", "/", "value3.1", undefined, "value3.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey3", "/", "value3.3");
                expectAllSize(1);
            });
        });

        describe("Nested map support", () => {
            it("supports setting a map as a value", async () => {
                const newMap = SharedMap.create(user1Document.runtime);
                root1Directory.set("mapKey", newMap.handle);
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                const [root1Map, root2Map, root3Map] = await Promise.all([
                    root1Directory.get<IComponentHandle>("mapKey").get<ISharedMap>(),
                    root2Directory.get<IComponentHandle>("mapKey").get<ISharedMap>(),
                    root3Directory.get<IComponentHandle>("mapKey").get<ISharedMap>(),
                ]);

                assert.ok(root1Map);
                assert.ok(root2Map);
                assert.ok(root3Map);

                root2Map.set("testMapKey", "testMapValue");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                assert.equal(root3Map.get("testMapKey"), "testMapValue", "Wrong values in map in document 3");
            });
        });
    });

    describe("SubDirectory operations", () => {
        it("should set a key in a SubDirectory in three documents correctly", async () => {
            root1Directory.createSubDirectory("testSubDir1").set("testKey1", "testValue1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
        });

        it("should delete a key in a SubDirectory in three documents correctly", async () => {
            root2Directory.createSubDirectory("testSubDir1").set("testKey1", "testValue1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
            const subDir1 = root3Directory.getWorkingDirectory("testSubDir1");
            subDir1.delete("testKey1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "testSubDir1", undefined);
        });

        it("should delete a child SubDirectory in a SubDirectory in three documents correctly", async () => {
            root2Directory.createSubDirectory("testSubDir1").set("testKey1", "testValue1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllAfterValues("testKey1", "testSubDir1", "testValue1");
            root3Directory.deleteSubDirectory("testSubDir1");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            assert.equal(root1Directory.getWorkingDirectory("testSubDir1"), undefined);
            assert.equal(root2Directory.getWorkingDirectory("testSubDir1"), undefined);
            assert.equal(root3Directory.getWorkingDirectory("testSubDir1"), undefined);
        });

        it("should have the correct size in three documents", async () => {
            root1Directory.createSubDirectory("testSubDir1").set("testKey1", "testValue1");
            root2Directory.createSubDirectory("testSubDir1").set("testKey2", "testValue2");
            root3Directory.createSubDirectory("otherSubDir2").set("testKey3", "testValue3");
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllSize(2, "testSubDir1");
            root3Directory.getWorkingDirectory("testSubDir1").clear();
            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
            expectAllSize(0, "testSubDir1");
        });

        it("should update value and trigger onValueChanged on other two documents", async () => {
            let user1ValueChangedCount: number = 0;
            let user2ValueChangedCount: number = 0;
            let user3ValueChangedCount: number = 0;
            root1Directory.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for key in document 1");
                        assert.equal(changed.path, "/testSubDir1", "Incorrect value for path in document 1");
                        user1ValueChangedCount = user1ValueChangedCount + 1;
                    }
                }
            });
            root2Directory.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for key in document 2");
                        assert.equal(changed.path, "/testSubDir1", "Incorrect value for path in document 2");
                        user2ValueChangedCount = user2ValueChangedCount + 1;
                    }
                }
            });
            root3Directory.on("valueChanged", (changed, local, msg) => {
                if (!local) {
                    if (msg.type === MessageType.Operation) {
                        assert.equal(changed.key, "testKey1", "Incorrect value for key in document 3");
                        assert.equal(changed.path, "/testSubDir1", "Incorrect value for path in document 3");
                        user3ValueChangedCount = user3ValueChangedCount + 1;
                    }
                }
            });

            root1Directory.createSubDirectory("testSubDir1").set("testKey1", "updatedValue");

            await documentDeltaEventManager.process(user1Document, user2Document, user3Document);

            assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in document 1");
            assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 2");
            assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in document 3");

            expectAllAfterValues("testKey1", "/testSubDir1", "updatedValue");
        });

        describe("Eventual consistency after simultaneous operations", () => {
            let root1SubDir;
            let root2SubDir;
            let root3SubDir;
            beforeEach(async () => {
                root1Directory.createSubDirectory("testSubDir").set("dummyKey", "dummyValue");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                root1SubDir = root1Directory.getWorkingDirectory("testSubDir");
                root2SubDir = root2Directory.getWorkingDirectory("testSubDir");
                root3SubDir = root3Directory.getWorkingDirectory("testSubDir");
            });

            it("set/set", async () => {
                root1SubDir.set("testKey1", "value1");
                root2SubDir.set("testKey1", "value2");
                root3SubDir.set("testKey1", "value0");
                root3SubDir.set("testKey1", "value3");

                expectAllBeforeValues("testKey1", "/testSubDir", "value1", "value2", "value3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey1", "/testSubDir", "value3");
            });

            it("delete/set", async () => {
                // set after delete
                root1SubDir.set("testKey1", "value1.1");
                root2SubDir.delete("testKey1");
                root3SubDir.set("testKey1", "value1.3");

                expectAllBeforeValues("testKey1", "/testSubDir", "value1.1", undefined, "value1.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey1", "/testSubDir", "value1.3");
            });

            it("delete/set from the same document", async () => {
                // delete and then set on the same document
                root1SubDir.set("testKey2", "value2.1");
                root2SubDir.delete("testKey2");
                root3SubDir.set("testKey2", "value2.3");
                // drain the outgoing so that the next set will come after
                await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
                root2SubDir.set("testKey2", "value2.2");

                expectAllBeforeValues("testKey2", "/testSubDir", "value2.1", "value2.2", "value2.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey2", "/testSubDir", "value2.2");
            });

            it("set/delete", async () => {
                // delete after set
                root1SubDir.set("testKey3", "value3.1");
                root2SubDir.set("testKey3", "value3.2");
                root3SubDir.delete("testKey3");

                expectAllBeforeValues("testKey3", "/testSubDir", "value3.1", "value3.2", undefined);
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey3", "/testSubDir", undefined);
            });

            it("set/clear", async () => {
                // clear after set
                root1SubDir.set("testKey1", "value1.1");
                root2SubDir.set("testKey1", "value1.2");
                root3SubDir.clear();
                expectAllBeforeValues("testKey1", "/testSubDir", "value1.1", "value1.2", undefined);
                assert.equal(root3SubDir.size, 0, "Incorrect map size after clear");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey1", "/testSubDir", undefined);
                expectAllSize(0, "/testSubDir");
            });

            it("clear/set on the same document", async () => {
                // set after clear on the same map
                root1SubDir.set("testKey2", "value2.1");
                root2SubDir.clear();
                root3SubDir.set("testKey2", "value2.3");
                // drain the outgoing so that the next set will come after
                await documentDeltaEventManager.processOutgoing(user1Document, user2Document, user3Document);
                root2SubDir.set("testKey2", "value2.2");
                expectAllBeforeValues("testKey2", "/testSubDir", "value2.1", "value2.2", "value2.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey2", "/testSubDir", "value2.2");
                expectAllSize(1, "/testSubDir");
            });

            it("clear/set", async () => {
                // set after clear
                root1SubDir.set("testKey3", "value3.1");
                root2SubDir.clear();
                root3SubDir.set("testKey3", "value3.3");
                expectAllBeforeValues("testKey3", "/testSubDir", "value3.1", undefined, "value3.3");
                await documentDeltaEventManager.process(user1Document, user2Document, user3Document);
                expectAllAfterValues("testKey3", "/testSubDir", "value3.3");
                expectAllSize(1, "/testSubDir");
            });
        });
    });

    afterEach(async () => {
        await Promise.all([
            user1Document.close(),
            user2Document.close(),
            user3Document.close(),
        ]);
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
