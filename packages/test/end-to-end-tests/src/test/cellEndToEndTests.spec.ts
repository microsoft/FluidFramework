/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISharedCell, SharedCell } from "@fluidframework/cell";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
} from "@fluidframework/test-utils";
import {
    generateTest,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "./compatUtils";

const cellId = "cellKey";
const registry: ChannelFactoryRegistry = [[cellId, SharedCell.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const tests = (argsFactory: () => ITestObjectProvider) => {
    let args: ITestObjectProvider;
    beforeEach(()=>{
        args = argsFactory();
    });
    afterEach(() => {
        args.reset();
    });

    const initialCellValue = "Initial cell value";
    const newCellValue = "A new cell value";

    let dataObject1: ITestFluidObject;
    let sharedCell1: ISharedCell;
    let sharedCell2: ISharedCell;
    let sharedCell3: ISharedCell;

    beforeEach(async () => {
        // Create a Container for the first client.
        const container1 = await args.makeTestContainer(testContainerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        sharedCell1 = await dataObject1.getSharedObject<SharedCell>(cellId);

        // Load the Container that was created by the first client.
        const container2 = await args.loadTestContainer(testContainerConfig);
        const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        sharedCell2 = await dataObject2.getSharedObject<SharedCell>(cellId);

        // Load the Container that was created by the first client.
        const container3 = await args.loadTestContainer(testContainerConfig);
        const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
        sharedCell3 = await dataObject3.getSharedObject<SharedCell>(cellId);

        // Set a starting value in the cell
        sharedCell1.set(initialCellValue);

        await args.opProcessingController.process();
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

        await args.opProcessingController.process();

        verifyCellValues(newCellValue, newCellValue, newCellValue);
    });

    it("can delete cell data in 3 containers correctly", async () => {
        sharedCell3.delete();

        await args.opProcessingController.process();

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

        await args.opProcessingController.process();

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

        await args.opProcessingController.process();

        verifyCellValues("value3", "value3", "value3");
    });

    it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
        // set after delete
        sharedCell1.set("value1.1");
        sharedCell2.delete();
        sharedCell3.set("value1.3");

        verifyCellValues("value1.1", undefined, "value1.3");

        await args.opProcessingController.process();

        verifyCellValues("value1.3", "value1.3", "value1.3");
    });

    it("Simultaneous delete/set on same cell should reach eventual consistency with the same value", async () => {
        // delete and then set on the same cell
        sharedCell1.set("value2.1");
        sharedCell2.delete();
        sharedCell3.set("value2.3");

        // drain the outgoing so that the next set will come after
        await args.opProcessingController.processOutgoing();

        sharedCell2.set("value2.2");
        verifyCellValues("value2.1", "value2.2", "value2.3");

        await args.opProcessingController.process();

        verifyCellValues("value2.2", "value2.2", "value2.2");
    });

    it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
        // delete after set
        sharedCell1.set("value3.1");
        sharedCell2.set("value3.2");
        sharedCell3.delete();

        verifyCellValues("value3.1", "value3.2", undefined);
        verifyCellEmpty(false, false, true);

        await args.opProcessingController.process();

        verifyCellValues(undefined, undefined, undefined);
        verifyCellEmpty(true, true, true);
    });

    it("registers data if data is a shared object", async () => {
        const detachedCell1: ISharedCell = SharedCell.create(dataObject1.runtime);
        const detachedCell2: ISharedCell = SharedCell.create(dataObject1.runtime);
        const cellValue = "cell cell cell cell";
        detachedCell2.set(cellValue);
        detachedCell1.set(detachedCell2.handle);
        sharedCell1.set(detachedCell1.handle);

        await args.opProcessingController.process();

        async function getCellDataStore(cellP: Promise<ISharedCell>): Promise<ISharedCell> {
            const cell = await cellP;
            const handle = cell.get() as IFluidHandle<ISharedCell>;
            return handle.get();
        }

        verifyCellValue(await getCellDataStore(getCellDataStore(Promise.resolve(sharedCell2))), cellValue, 2);
        verifyCellValue(await getCellDataStore(getCellDataStore(Promise.resolve(sharedCell3))), cellValue, 3);
    });
};

describe("Cell", () => {
    generateTest(tests);
});
