/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails, ILoader } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    createLocalLoader,
    ITestFluidComponent,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@microsoft/fluid-test-utils";

describe("Cell", () => {
    const id = "fluid-test://localhost/cellTest";
    const cellId = "cellKey";
    const initialCellValue = "Initial cell value";
    const newCellValue = "A new cell value";
    const codeDetails: IFluidCodeDetails = {
        package: "sharedCellTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let component1: ITestFluidComponent;
    let sharedCell1: ISharedCell;
    let sharedCell2: ISharedCell;
    let sharedCell3: ISharedCell;

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory([[ cellId, SharedCell.getFactory() ]]);
        const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        component1 = await getComponent("default", container1);
        sharedCell1 = await component1.getSharedObject<SharedCell>(cellId);

        const container2 = await createContainer();
        const component2 = await getComponent("default", container2);
        sharedCell2 = await component2.getSharedObject<SharedCell>(cellId);

        const container3 = await createContainer();
        const component3 = await getComponent("default", container3);
        sharedCell3 = await component3.getSharedObject<SharedCell>(cellId);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime, component3.runtime);

        // Set a starting value in the cell
        sharedCell1.set(initialCellValue);

        await containerDeltaEventManager.process();
    });

    function verifyCellValue(cell: ISharedCell, expectedValue, index: number) {
        const userValue = cell.get();
        assert.equal(userValue, expectedValue,
            `Incorrect value ${userValue} instead of ${expectedValue} in container ${index}`);
    }

    function verifyCellValues(value1, value2, value3) {
        verifyCellValue(sharedCell1, value1, 1);
        verifyCellValue(sharedCell2, value2, 2);
        verifyCellValue(sharedCell3, value3, 3);
    }

    function verifyCellEmpty(value1: boolean, value2: boolean, value3: boolean) {
        const user1Empty = sharedCell1.empty();
        assert.equal(user1Empty, value1, `Incorrect value ${user1Empty} instead of ${value1} in container 1`);
        const user2Empty = sharedCell2.empty();
        assert.equal(user2Empty, value2, `Incorrect value ${user2Empty} instead of ${value2} in container 2`);
        const user3Empty = sharedCell3.empty();
        assert.equal(user3Empty, value3, `Incorrect value ${user3Empty} instead of ${value3} in container 3`);
    }

    it("can create the cell in 3 containers correctly", async () => {
        // Cell was created and populated in beforeEach
        assert.ok(sharedCell1, `Couldn't find the cell in container1, instead got ${sharedCell1}`);
        assert.ok(sharedCell2, `Couldn't find the cell in container2, instead got ${sharedCell2}`);
        assert.ok(sharedCell3, `Couldn't find the cell in container3, instead got ${sharedCell3}`);
    });

    it("can get cell data in 3 containers correctly", async () => {
        // Cell was created and populated in beforeEach
        verifyCellValues(initialCellValue, initialCellValue, initialCellValue);
    });

    it("can set and get cell data in 3 containers correctly", async () => {
        sharedCell2.set(newCellValue);

        await containerDeltaEventManager.process();

        verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("can delete cell data in 3 containers correctly", async () => {
        sharedCell3.delete();

        await containerDeltaEventManager.process();

        verifyCellEmpty(true, true, true);
    });

    it("can update value and trigger onValueChanged on other two containers", async () => {
        let user1ValueChangedCount: number = 0;
        let user2ValueChangedCount: number = 0;
        let user3ValueChangedCount: number = 0;

        // Set up event listeners for the valueChanged that will count calls and check values
        sharedCell1.on("valueChanged", (newValue) => {
            assert.equal(newValue, newCellValue, `Incorrect value for changed in container 1: ${newValue}`);
            user1ValueChangedCount = user1ValueChangedCount + 1;
        });
        sharedCell2.on("valueChanged", (newValue) => {
            assert.equal(newValue, newCellValue, `Incorrect value for changed in container 2: ${newValue}`);
            user2ValueChangedCount = user2ValueChangedCount + 1;
        });
        sharedCell3.on("valueChanged", (newValue) => {
            assert.equal(newValue, newCellValue, `Incorrect value for changed in container 3: ${newValue}`);
            user3ValueChangedCount = user3ValueChangedCount + 1;
        });

        sharedCell1.set(newCellValue);

        await containerDeltaEventManager.process();

        assert.equal(user1ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 1");
        assert.equal(user2ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 2");
        assert.equal(user3ValueChangedCount, 1, "Incorrect number of valueChanged op received in container 3");

        verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("Simultaneous set should reach eventual consistency with the same value", async () => {
        sharedCell1.set("value1");
        sharedCell2.set("value2");
        sharedCell3.set("value0");
        sharedCell3.set("value3");

        verifyCellValues("value1", "value2", "value3");

        await containerDeltaEventManager.process();

        verifyCellValues("value3", "value3", "value3");
    });

    it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
        // set after delete
        sharedCell1.set("value1.1");
        sharedCell2.delete();
        sharedCell3.set("value1.3");

        verifyCellValues("value1.1", undefined, "value1.3");

        await containerDeltaEventManager.process();

        verifyCellValues("value1.3", "value1.3", "value1.3");
    });

    it("Simultaneous delete/set on same cell should reach eventual consistency with the same value", async () => {
        // delete and then set on the same cell
        sharedCell1.set("value2.1");
        sharedCell2.delete();
        sharedCell3.set("value2.3");

        // drain the outgoing so that the next set will come after
        await containerDeltaEventManager.processOutgoing();

        sharedCell2.set("value2.2");
        verifyCellValues("value2.1", "value2.2", "value2.3");

        await containerDeltaEventManager.process();

        verifyCellValues("value2.2", "value2.2", "value2.2");
    });

    it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
        // delete after set
        sharedCell1.set("value3.1");
        sharedCell2.set("value3.2");
        sharedCell3.delete();

        verifyCellValues("value3.1", "value3.2", undefined);
        verifyCellEmpty(false, false, true);

        await containerDeltaEventManager.process();

        verifyCellValues(undefined, undefined, undefined);
        verifyCellEmpty(true, true, true);
    });

    it("registers data if data is a shared object", async () => {
        const detachedCell1: ISharedCell = SharedCell.create(component1.runtime);
        const detachedCell2: ISharedCell = SharedCell.create(component1.runtime);
        const cellValue = "cell cell cell cell";
        detachedCell2.set(cellValue);
        detachedCell1.set(detachedCell2.handle);
        assert(!detachedCell2.isRegistered(), "The new cell should not be registered");

        sharedCell1.set(detachedCell1.handle);
        assert(detachedCell2.isRegistered(), "The new cell should now be registered");

        await containerDeltaEventManager.process();

        async function getCellComponent(cellP: Promise<ISharedCell>): Promise<ISharedCell> {
            const cell = await cellP;
            const handle = cell.get() as IComponentHandle<ISharedCell>;
            return handle.get();
        }

        verifyCellValue(await getCellComponent(getCellComponent(Promise.resolve(sharedCell2))), cellValue, 2);
        verifyCellValue(await getCellComponent(getCellComponent(Promise.resolve(sharedCell3))), cellValue, 3);
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
