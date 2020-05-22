/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import { MessageType } from "@fluidframework/protocol-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

describe("Map", () => {
    const id = "fluid-test://localhost/mapTest";
    const mapId = "mapKey";
    const codeDetails: IFluidCodeDetails = {
        package: "sharedMapTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let sharedMap1: ISharedMap;
    let sharedMap2: ISharedMap;
    let sharedMap3: ISharedMap;

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory([[ mapId, SharedMap.getFactory() ]]);
        const loader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        const component1 = await getComponent("default", container1);
        sharedMap1 = await component1.getSharedObject<SharedMap>(mapId);

        const container2 = await createContainer();
        const component2 = await getComponent("default", container2);
        sharedMap2 = await component2.getSharedObject<SharedMap>(mapId);

        const container3 = await createContainer();
        const component3 = await getComponent("default", container3);
        sharedMap3 = await component3.getSharedObject<SharedMap>(mapId);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime, component3.runtime);

        sharedMap1.set("testKey1", "testValue");

        await containerDeltaEventManager.process();
    });

    function expectAllValues(msg, key, value1, value2, value3) {
        const user1Value = sharedMap1.get(key);
        assert.equal(user1Value, value1, `Incorrect value for ${key} in container 1 ${msg}`);
        const user2Value = sharedMap2.get(key);
        assert.equal(user2Value, value2, `Incorrect value for ${key} in container 2 ${msg}`);
        const user3Value = sharedMap3.get(key);
        assert.equal(user3Value, value3, `Incorrect value for ${key} in container 3 ${msg}`);
    }

    function expectAllBeforeValues(key, value1, value2, value3) {
        expectAllValues("before process", key, value1, value2, value3);
    }

    function expectAllAfterValues(key, value) {
        expectAllValues("after process", key, value, value, value);
    }

    function expectAllSize(size) {
        const keys1 = Array.from(sharedMap1.keys());
        assert.equal(keys1.length, size, "Incorrect number of Keys in container 1");
        const keys2 = Array.from(sharedMap2.keys());
        assert.equal(keys2.length, size, "Incorrect number of Keys in container 2");
        const keys3 = Array.from(sharedMap3.keys());
        assert.equal(keys3.length, size, "Incorrect number of Keys in container 3");

        assert.equal(sharedMap1.size, size, "Incorrect map size in container 1");
        assert.equal(sharedMap2.size, size, "Incorrect map size in container 2");
        assert.equal(sharedMap3.size, size, "Incorrect map size in container 3");
    }

    it("should set key value in three containers correctly", async () => {
        expectAllAfterValues("testKey1", "testValue");
    });

    it("should set key value to undefined in three containers correctly", async () => {
        sharedMap2.set("testKey1", undefined);
        sharedMap2.set("testKey2", undefined);

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey1", undefined);
        expectAllAfterValues("testKey2", undefined);
    });

    it("Should delete values in 3 containers correctly", async () => {
        sharedMap2.delete("testKey1");

        await containerDeltaEventManager.process();

        const hasKey1 = sharedMap1.has("testKey1");
        assert.equal(hasKey1, false, "testKey1 not deleted in container 1");

        const hasKey2 = sharedMap2.has("testKey1");
        assert.equal(hasKey2, false, "testKey1 not deleted in container 1");

        const hasKey3 = sharedMap3.has("testKey1");
        assert.equal(hasKey3, false, "testKey1 not deleted in container 1");
    });

    it("Should check if three containers has same number of keys", async () => {
        sharedMap3.set("testKey3", true);

        await containerDeltaEventManager.process();

        expectAllSize(2);
    });

    it("Should update value and trigger onValueChanged on other two containers", async () => {
        let user1ValueChangedCount: number = 0;
        let user2ValueChangedCount: number = 0;
        let user3ValueChangedCount: number = 0;
        sharedMap1.on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 1");
                    user1ValueChangedCount = user1ValueChangedCount + 1;
                }
            }
        });
        sharedMap2.on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 2");
                    user2ValueChangedCount = user2ValueChangedCount + 1;
                }
            }
        });
        sharedMap3.on("valueChanged", (changed, local, msg) => {
            if (!local) {
                if (msg.type === MessageType.Operation) {
                    assert.equal(changed.key, "testKey1", "Incorrect value for testKey1 in container 3");
                    user3ValueChangedCount = user3ValueChangedCount + 1;
                }
            }
        });

        sharedMap1.set("testKey1", "updatedValue");

        await containerDeltaEventManager.process();

        assert.equal(user1ValueChangedCount, 0, "Incorrect number of valueChanged op received in container 1");
        assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 2");
        assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 3");

        expectAllAfterValues("testKey1", "updatedValue");
    });

    it("Simultaneous set should reach eventual consistency with the same value", async () => {
        sharedMap1.set("testKey1", "value1");
        sharedMap2.set("testKey1", "value2");
        sharedMap3.set("testKey1", "value0");
        sharedMap3.set("testKey1", "value3");

        expectAllBeforeValues("testKey1", "value1", "value2", "value3");

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey1", "value3");
    });

    it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
        // set after delete
        sharedMap1.set("testKey1", "value1.1");
        sharedMap2.delete("testKey1");
        sharedMap3.set("testKey1", "value1.3");

        expectAllBeforeValues("testKey1", "value1.1", undefined, "value1.3");

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey1", "value1.3");
    });

    it("Simultaneous delete/set on same map should reach eventual consistency with the same value", async () => {
        // delete and then set on the same map
        sharedMap1.set("testKey2", "value2.1");
        sharedMap2.delete("testKey2");
        sharedMap3.set("testKey2", "value2.3");

        // drain the outgoing so that the next set will come after
        await containerDeltaEventManager.processOutgoing();

        sharedMap2.set("testKey2", "value2.2");
        expectAllBeforeValues("testKey2", "value2.1", "value2.2", "value2.3");

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey2", "value2.2");
    });

    it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
        // delete after set
        sharedMap1.set("testKey3", "value3.1");
        sharedMap2.set("testKey3", "value3.2");
        sharedMap3.delete("testKey3");

        expectAllBeforeValues("testKey3", "value3.1", "value3.2", undefined);

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey3", undefined);
    });

    it("Simultaneous set/clear on a key should reach eventual consistency with the same value", async () => {
        // clear after set
        sharedMap1.set("testKey1", "value1.1");
        sharedMap2.set("testKey1", "value1.2");
        sharedMap3.clear();
        expectAllBeforeValues("testKey1", "value1.1", "value1.2", undefined);
        assert.equal(sharedMap3.size, 0, "Incorrect map size after clear");

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey1", undefined);
        expectAllSize(0);
    });

    it("Simultaneous clear/set on same map should reach eventual consistency with the same value", async () => {
        // set after clear on the same map
        sharedMap1.set("testKey2", "value2.1");
        sharedMap2.clear();
        sharedMap3.set("testKey2", "value2.3");

        // drain the outgoing so that the next set will come after
        await containerDeltaEventManager.processOutgoing();

        sharedMap2.set("testKey2", "value2.2");
        expectAllBeforeValues("testKey2", "value2.1", "value2.2", "value2.3");

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey2", "value2.2");
        expectAllSize(1);
    });

    it("Simultaneous clear/set should reach eventual consistency and resolve to the same value", async () => {
        // set after clear
        sharedMap1.set("testKey3", "value3.1");
        sharedMap2.clear();
        sharedMap3.set("testKey3", "value3.3");
        expectAllBeforeValues("testKey3", "value3.1", undefined, "value3.3");

        await containerDeltaEventManager.process();

        expectAllAfterValues("testKey3", "value3.3");
        expectAllSize(1);
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
