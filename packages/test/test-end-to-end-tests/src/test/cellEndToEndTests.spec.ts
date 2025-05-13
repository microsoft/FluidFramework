/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	ConfigTypes,
	IConfigProviderBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

const cellId = "cellKey";

describeCompat("SharedCell", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedCell } = apis.dds;

	const registry: ChannelFactoryRegistry = [[cellId, SharedCell.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	const initialCellValue = "Initial cell value";
	const newCellValue = "A new cell value";

	let dataObject1: ITestFluidObject;
	let sharedCell1: ISharedCell;
	let sharedCell2: ISharedCell;
	let sharedCell3: ISharedCell;

	beforeEach("setup", async () => {
		// Create a Container for the first client.
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedCell1 = await dataObject1.getSharedObject<ISharedCell>(cellId);

		// Load the Container that was created by the first client.
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedCell2 = await dataObject2.getSharedObject<ISharedCell>(cellId);

		// Load the Container that was created by the first client.
		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataObject3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);
		sharedCell3 = await dataObject3.getSharedObject<ISharedCell>(cellId);

		// Set a starting value in the cell
		sharedCell1.set(initialCellValue);

		await provider.ensureSynchronized();
	});

	function verifyCellValue(cell: ISharedCell, expectedValue, index: number) {
		const userValue = cell.get();
		assert.equal(
			userValue,
			expectedValue,
			`Incorrect value ${userValue} instead of ${expectedValue} in container ${index}`,
		);
	}

	function verifyCellValues(value1, value2, value3) {
		verifyCellValue(sharedCell1, value1, 1);
		verifyCellValue(sharedCell2, value2, 2);
		verifyCellValue(sharedCell3, value3, 3);
	}

	function verifyCellEmpty(value1: boolean, value2: boolean, value3: boolean) {
		const user1Empty = sharedCell1.empty();
		assert.equal(
			user1Empty,
			value1,
			`Incorrect value ${user1Empty} instead of ${value1} in container 1`,
		);
		const user2Empty = sharedCell2.empty();
		assert.equal(
			user2Empty,
			value2,
			`Incorrect value ${user2Empty} instead of ${value2} in container 2`,
		);
		const user3Empty = sharedCell3.empty();
		assert.equal(
			user3Empty,
			value3,
			`Incorrect value ${user3Empty} instead of ${value3} in container 3`,
		);
	}

	it("can create the cell in 3 containers correctly", async () => {
		// Cell was created and populated in beforeEach
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		assert.ok(sharedCell1, `Couldn't find the cell in container1, instead got ${sharedCell1}`);
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		assert.ok(sharedCell2, `Couldn't find the cell in container2, instead got ${sharedCell2}`);
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		assert.ok(sharedCell3, `Couldn't find the cell in container3, instead got ${sharedCell3}`);
	});

	it("can get cell data in 3 containers correctly", async () => {
		// Cell was created and populated in beforeEach
		verifyCellValues(initialCellValue, initialCellValue, initialCellValue);
	});

	it("can set and get cell data in 3 containers correctly", async () => {
		sharedCell2.set(newCellValue);

		await provider.ensureSynchronized();

		verifyCellValues(newCellValue, newCellValue, newCellValue);
	});

	it("can delete cell data in 3 containers correctly", async () => {
		sharedCell3.delete();

		await provider.ensureSynchronized();

		verifyCellEmpty(true, true, true);
	});

	it("can update value and trigger onValueChanged on other two containers", async () => {
		let user1ValueChangedCount: number = 0;
		let user2ValueChangedCount: number = 0;
		let user3ValueChangedCount: number = 0;

		// Set up event listeners for the valueChanged that will count calls and check values
		sharedCell1.on("valueChanged", (newValue) => {
			assert.equal(
				newValue,
				newCellValue,
				`Incorrect value for changed in container 1: ${newValue}`,
			);
			user1ValueChangedCount = user1ValueChangedCount + 1;
		});
		sharedCell2.on("valueChanged", (newValue) => {
			assert.equal(
				newValue,
				newCellValue,
				`Incorrect value for changed in container 2: ${newValue}`,
			);
			user2ValueChangedCount = user2ValueChangedCount + 1;
		});
		sharedCell3.on("valueChanged", (newValue) => {
			assert.equal(
				newValue,
				newCellValue,
				`Incorrect value for changed in container 3: ${newValue}`,
			);
			user3ValueChangedCount = user3ValueChangedCount + 1;
		});

		sharedCell1.set(newCellValue);

		await provider.ensureSynchronized();

		assert.equal(
			user1ValueChangedCount,
			1,
			"Incorrect number of valueChanged op received in container 1",
		);
		assert.equal(
			user2ValueChangedCount,
			1,
			"Incorrect number of valueChanged op received in container 2",
		);
		assert.equal(
			user3ValueChangedCount,
			1,
			"Incorrect number of valueChanged op received in container 3",
		);

		verifyCellValues(newCellValue, newCellValue, newCellValue);
	});

	it("Simultaneous set should reach eventual consistency with the same value", async () => {
		sharedCell1.set("value1");
		sharedCell2.set("value2");
		sharedCell3.set("value0");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedCell3.set("value3");

		verifyCellValues("value1", "value2", "value3");

		await provider.ensureSynchronized();

		verifyCellValues("value3", "value3", "value3");
	});

	it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
		// set after delete
		sharedCell1.set("value1.1");
		sharedCell2.delete();

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedCell3.set("value1.3");

		verifyCellValues("value1.1", undefined, "value1.3");

		await provider.ensureSynchronized();

		verifyCellValues("value1.3", "value1.3", "value1.3");
	});

	it("Simultaneous delete/set on same cell should reach eventual consistency with the same value", async () => {
		// delete and then set on the same cell
		sharedCell1.set("value2.1");
		sharedCell2.delete();
		sharedCell3.set("value2.3");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedCell2.set("value2.2");
		verifyCellValues("value2.1", "value2.2", "value2.3");

		await provider.ensureSynchronized();

		verifyCellValues("value2.2", "value2.2", "value2.2");
	});

	it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
		// delete after set
		sharedCell1.set("value3.1");
		sharedCell2.set("value3.2");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedCell3.delete();

		verifyCellValues("value3.1", "value3.2", undefined);
		verifyCellEmpty(false, false, true);

		await provider.ensureSynchronized();

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

		await provider.ensureSynchronized();

		async function getCellDataStore(cellP: Promise<ISharedCell>): Promise<ISharedCell> {
			const cell = await cellP;
			const handle = cell.get() as IFluidHandle<ISharedCell>;
			return handle.get();
		}

		verifyCellValue(
			await getCellDataStore(getCellDataStore(Promise.resolve(sharedCell2))),
			cellValue,
			2,
		);
		verifyCellValue(
			await getCellDataStore(getCellDataStore(Promise.resolve(sharedCell3))),
			cellValue,
			3,
		);
	});

	it("attaches if referring SharedCell becomes attached or is already attached", async () => {
		const detachedCell1: ISharedCell = SharedCell.create(dataObject1.runtime);
		const detachedCell2: ISharedCell = SharedCell.create(dataObject1.runtime);

		// When an unattached cell refers to another unattached cell, both remain unattached
		detachedCell1.set(detachedCell2.handle);
		assert.equal(sharedCell1.isAttached(), true, "sharedCell1 should be attached");
		assert.equal(detachedCell1.isAttached(), false, "detachedCell1 should not be attached");
		assert.equal(detachedCell2.isAttached(), false, "detachedCell2 should not be attached");

		// When referring cell becomes attached, the referred cell becomes attached
		// and the attachment transitively passes to a second referred cell
		sharedCell1.set(detachedCell1.handle);
		assert.equal(sharedCell1.isAttached(), true, "sharedCell1 should be attached");
		assert.equal(detachedCell1.isAttached(), true, "detachedCell1 should be attached");
		assert.equal(detachedCell2.isAttached(), true, "detachedCell2 should be attached");
	});
});

describeCompat("SharedCell orderSequentially", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedCell } = apis.dds;

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedCell: ISharedCell;
	let containerRuntime: IContainerRuntime;
	let changedEventData: Serializable<unknown>[];

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});
	const errorMessage = "callback failure";

	beforeEach("setup", async () => {
		const configWithFeatureGates: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry: [[cellId, SharedCell.getFactory()]],
			loaderProps: {
				configProvider: configProvider({
					"Fluid.ContainerRuntime.EnableRollback": true,
				}),
			},
		};
		container = await provider.makeTestContainer(configWithFeatureGates);
		dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		sharedCell = await dataObject.getSharedObject<ISharedCell>(cellId);
		containerRuntime = dataObject.context.containerRuntime as IContainerRuntime;
		changedEventData = [];
		sharedCell.on("valueChanged", (value) => {
			changedEventData.push(value);
		});
	});

	it("Should rollback set", async () => {
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedCell.set(0);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedCell.get(), undefined);
		assert.equal(changedEventData[0], 0);
		// rollback
		assert.equal(changedEventData[1], undefined);
	});

	it("Should rollback set to prior value", async () => {
		sharedCell.set("old");
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedCell.set("new");
				sharedCell.set("last");
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedCell.get(), "old");
		assert.equal(changedEventData[0], "old");
		assert.equal(changedEventData[1], "new");
		assert.equal(changedEventData[2], "last");
		// rollback
		assert.equal(changedEventData[3], "new");
		assert.equal(changedEventData[4], "old");
	});

	it("Should rollback delete", async () => {
		sharedCell.set("old");
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedCell.delete();
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedCell.get(), "old");
	});
});
