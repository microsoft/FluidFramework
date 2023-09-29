/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
// import { type IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { Spanner } from "../spanner";

// const cellFactory = SharedCell.getFactory();

// function createConnectedCell(
// 	id: string,
// 	runtimeFactory: MockContainerRuntimeFactory,
// ): Spanner<SharedCell, SharedMap> {
// 	// Create and connect a second SharedCell.
// 	const dataStoreRuntime = new MockFluidDataStoreRuntime();

// 	runtimeFactory.createContainerRuntime(dataStoreRuntime);
// 	const services = {
// 		deltaConnection: dataStoreRuntime.createDeltaConnection(),
// 		objectStorage: new MockStorage(),
// 	};

// 	const cell = new SharedCell(id, dataStoreRuntime, cellFactory.attributes);
// 	cell.connect(services);
// 	return cell;
// }

// function createDetachedCell(id: string): Spanner {
// 	const dataStoreRuntime = new MockFluidDataStoreRuntime();
// 	const subCell = new SharedCell(id, dataStoreRuntime, cellFactory.attributes);
// 	return subCell;
// }

// function createCellForReconnection(
// 	id: string,
// 	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
// ): { cell: ISharedCell; containerRuntime: MockContainerRuntimeForReconnection } {
// 	const dataStoreRuntime = new MockFluidDataStoreRuntime();
// 	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
// 	const services = {
// 		deltaConnection: dataStoreRuntime.createDeltaConnection(),
// 		objectStorage: new MockStorage(),
// 	};

// 	const cell = new SharedCell(id, dataStoreRuntime, CellFactory.Attributes);
// 	cell.connect(services);
// 	return { cell, containerRuntime };
// }

describe("Spanner", () => {
	it("can create a Spanner", () => {
		const mockFluidRuntime = new MockFluidDataStoreRuntime();
		const spanner = new Spanner(
			"spanner",
			mockFluidRuntime,
			SharedCell.getFactory(),
			SharedMap.getFactory().create(mockFluidRuntime, "spanner") as SharedMap,
		);
		assert.ok(spanner, "Could not create a Spanner");
	});
});

// describe("Cell", () => {
// 	describe("Detached state", () => {
// 		/* The aim of this section is to carry out a test on an individual cell that is not linked to any container.
// 		 * Its objective is equivalent to the mocha tests labeled as "Local state" in other DDS.
// 		 */
// 		let cell: ISharedCell;

// 		beforeEach(() => {
// 			cell = createDetachedCell("cell");
// 		});

// 		describe("APIs", () => {
// 			it("Can create a cell", () => {
// 				assert.ok(cell, "Could not create a cell");
// 			});

// 			it("Can set and get cell data", () => {
// 				cell.set("testValue");
// 				assert.equal(cell.get(), "testValue", "Could not retrieve cell value");
// 			});

// 			it("can delete cell data", () => {
// 				cell.set("testValue");
// 				assert.equal(cell.get(), "testValue", "Could not retrieve cell value");

// 				cell.delete();
// 				assert.equal(cell.get(), undefined, "Could not delete cell value");
// 			});

// 			it("can load a SharedCell from snapshot", async () => {
// 				cell.set("testValue");
// 				assert.equal(cell.get(), "testValue", "Could not retrieve cell value");

// 				const services = MockSharedObjectServices.createFromSummary(
// 					cell.getAttachSummary().summary,
// 				);
// 				const cell2 = new SharedCell(
// 					"cell2",
// 					new MockFluidDataStoreRuntime(),
// 					CellFactory.Attributes,
// 				);
// 				await cell2.load(services);

// 				assert.equal(cell2.get(), "testValue", "Could not load SharedCell from snapshot");
// 			});

// 			it("can load a SharedCell with undefined value from snapshot", async () => {
// 				const services = MockSharedObjectServices.createFromSummary(
// 					cell.getAttachSummary().summary,
// 				);
// 				const cell2 = new SharedCell(
// 					"cell2",
// 					new MockFluidDataStoreRuntime(),
// 					CellFactory.Attributes,
// 				);
// 				await cell2.load(services);

// 				assert.equal(cell2.get(), undefined, "Could not load SharedCell from snapshot");
// 			});
// 		});

// 		describe("Op processing in detached state", () => {
// 			it("should correctly process a set operation sent in detached state", async () => {
// 				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
// 				const cell1 = new SharedCell("cell1", dataStoreRuntime1, CellFactory.Attributes);
// 				// Set a value in detached state.
// 				const value = "testValue";
// 				cell1.set(value);

// 				// Load a new SharedCell in connected state from the snapshot of the first one.
// 				const containerRuntimeFactory = new MockContainerRuntimeFactory();
// 				const dataStoreRuntime2 = new MockFluidDataStoreRuntime();

// 				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
// 				const services2 = MockSharedObjectServices.createFromSummary(
// 					cell1.getAttachSummary().summary,
// 				);
// 				services2.deltaConnection = dataStoreRuntime2.createDeltaConnection();

// 				const cell2 = new SharedCell("cell2", dataStoreRuntime2, CellFactory.Attributes);
// 				await cell2.load(services2);

// 				// Now connect the first SharedCell
// 				dataStoreRuntime1.local = false;

// 				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
// 				const services1 = {
// 					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
// 					objectStorage: new MockStorage(),
// 				};
// 				cell1.connect(services1);

// 				// Verify that both the cells have the value.
// 				assert.equal(cell1.get(), value, "The first cell does not have the key");
// 				assert.equal(cell2.get(), value, "The second cell does not have the key");

// 				// Set a new value in the second SharedCell.
// 				const newValue = "newValue";
// 				cell2.set(newValue);

// 				// Process the message.
// 				containerRuntimeFactory.processAllMessages();

// 				// Verify that both the cells have the new value.
// 				assert.equal(cell1.get(), newValue, "The first cell did not get the new value");
// 				assert.equal(cell2.get(), newValue, "The second cell did not get the new value");
// 			});
// 		});
// 	});

// 	describe("Connected state", () => {
// 		let cell1: ISharedCell;
// 		let cell2: ISharedCell;
// 		let containerRuntimeFactory: MockContainerRuntimeFactory;

// 		describe("APIs", () => {
// 			beforeEach(() => {
// 				containerRuntimeFactory = new MockContainerRuntimeFactory();
// 				// Connect the first SharedCell.
// 				cell1 = createConnectedCell("cell1", containerRuntimeFactory);
// 				// Create a second SharedCell.
// 				cell2 = createConnectedCell("cell2", containerRuntimeFactory);
// 			});

// 			it("Can set and get cell data", () => {
// 				cell1.set("testValue");

// 				containerRuntimeFactory.processAllMessages();

// 				assert.equal(cell1.get(), "testValue", "Could not retrieve cell value");
// 				assert.equal(
// 					cell2.get(),
// 					"testValue",
// 					"Could not retrieve cell value from remote client",
// 				);
// 			});

// 			it("can delete cell data", () => {
// 				cell1.set("testValue");

// 				containerRuntimeFactory.processAllMessages();

// 				assert.equal(cell1.get(), "testValue", "Could not retrieve cell value");
// 				assert.equal(
// 					cell2.get(),
// 					"testValue",
// 					"Could not retrieve cell value from remote client",
// 				);

// 				cell1.delete();

// 				containerRuntimeFactory.processAllMessages();

// 				assert.equal(cell1.get(), undefined, "Could not delete cell value");
// 				assert.equal(
// 					cell2.get(),
// 					undefined,
// 					"Could not delete cell value from remote client",
// 				);
// 			});

// 			it("Shouldn't overwrite value if there is pending set", () => {
// 				const value1 = "value1";
// 				const pending1 = "pending1";
// 				const pending2 = "pending2";
// 				cell1.set(value1);
// 				cell2.set(pending1);
// 				cell2.set(pending2);

// 				containerRuntimeFactory.processSomeMessages(1);

// 				// Verify the SharedCell with processed message
// 				assert.equal(cell1.empty(), false, "could not find the set value");
// 				assert.equal(cell1.get(), value1, "could not get the set value");

// 				// Verify the SharedCell with 2 pending messages
// 				assert.equal(cell2.empty(), false, "could not find the set value in pending cell");
// 				assert.equal(
// 					cell2.get(),
// 					pending2,
// 					"could not get the set value from pending cell",
// 				);

// 				containerRuntimeFactory.processSomeMessages(1);

// 				// Verify the SharedCell gets updated from remote
// 				assert.equal(cell1.empty(), false, "could not find the set value");
// 				assert.equal(cell1.get(), pending1, "could not get the set value");

// 				// Verify the SharedCell with 1 pending message
// 				assert.equal(cell2.empty(), false, "could not find the set value in pending cell");
// 				assert.equal(
// 					cell2.get(),
// 					pending2,
// 					"could not get the set value from pending cell",
// 				);
// 			});
// 		});
// 	});

// 	describe("Reconnection", () => {
// 		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
// 		let containerRuntime1: MockContainerRuntimeForReconnection;
// 		let containerRuntime2: MockContainerRuntimeForReconnection;
// 		let cell1: ISharedCell;
// 		let cell2: ISharedCell;

// 		beforeEach(() => {
// 			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

// 			// Connect the first SharedCell.
// 			const response1 = createCellForReconnection("cell1", containerRuntimeFactory);
// 			cell1 = response1.cell;
// 			containerRuntime1 = response1.containerRuntime;

// 			// Create a second SharedCell.
// 			const response2 = createCellForReconnection("cell2", containerRuntimeFactory);
// 			cell2 = response2.cell;
// 			containerRuntime2 = response2.containerRuntime;
// 		});

// 		it("can resend unacked ops on reconnection", async () => {
// 			const value = "testValue";

// 			// Set a value on the first SharedCell.
// 			cell1.set(value);

// 			// Disconnect and reconnect the first client.
// 			containerRuntime1.connected = false;
// 			containerRuntime1.connected = true;

// 			// Process the messages.
// 			containerRuntimeFactory.processAllMessages();

// 			// Verify that the set value is processed by both clients.
// 			assert.equal(cell1.get(), value, "The first client did not process the set");
// 			assert.equal(cell2.get(), value, "The second client did not process the set");

// 			// Delete the value from the second SharedCell.
// 			cell2.delete();

// 			// Disconnect and reconnect the second client.
// 			containerRuntime2.connected = false;
// 			containerRuntime2.connected = true;

// 			// Process the messages.
// 			containerRuntimeFactory.processAllMessages();

// 			// Verify that the deleted value is processed by both clients.
// 			assert.equal(cell1.get(), undefined, "The first client did not process the delete");
// 			assert.equal(cell2.get(), undefined, "The second client did not process the delete");
// 		});

// 		it("can store ops in disconnected state and resend them on reconnection", async () => {
// 			const value = "testValue";

// 			// Disconnect the first client.
// 			containerRuntime1.connected = false;

// 			// Set a value on the first SharedCell.
// 			cell1.set(value);

// 			// Reconnect the first client.
// 			containerRuntime1.connected = true;

// 			// Process the messages.
// 			containerRuntimeFactory.processAllMessages();

// 			// Verify that the set value is processed by both clients.
// 			assert.equal(cell1.get(), value, "The first client did not process the set");
// 			assert.equal(cell2.get(), value, "The second client did not process the set");

// 			// Disconnect the second client.
// 			containerRuntime2.connected = false;

// 			// Delete the value from the second SharedCell.
// 			cell2.delete();

// 			// Reconnect the second client.
// 			containerRuntime2.connected = true;

// 			// Process the messages.
// 			containerRuntimeFactory.processAllMessages();

// 			// Verify that the deleted value is processed by both clients.
// 			assert.equal(cell1.get(), undefined, "The first client did not process the delete");
// 			assert.equal(cell2.get(), undefined, "The second client did not process the delete");
// 		});
// 	});

// 	describe("Garbage Collection", () => {
// 		class GCSharedCellProvider implements IGCTestProvider {
// 			private subCellCount = 0;
// 			private _expectedRoutes: string[] = [];
// 			private readonly cell1: ISharedCell;
// 			private readonly cell2: ISharedCell;
// 			private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

// 			public constructor() {
// 				this.containerRuntimeFactory = new MockContainerRuntimeFactory();
// 				this.cell1 = createConnectedCell("cell1", this.containerRuntimeFactory);
// 				this.cell2 = createConnectedCell("cell2", this.containerRuntimeFactory);
// 			}

// 			/**
// 			 * {@inheritDoc @fluid-internal/test-dds-utils#IGCTestProvider.sharedObject}
// 			 */
// 			public get sharedObject(): ISharedCell {
// 				// Return the remote SharedCell because we want to verify its summary data.
// 				return this.cell2;
// 			}

// 			/**
// 			 * {@inheritDoc @fluid-internal/test-dds-utils#IGCTestProvider.expectedOutboundRoutes}
// 			 */
// 			public get expectedOutboundRoutes(): string[] {
// 				return this._expectedRoutes;
// 			}

// 			/**
// 			 * {@inheritDoc @fluid-internal/test-dds-utils#IGCTestProvider.addOutboundRoutes}
// 			 */
// 			public async addOutboundRoutes(): Promise<void> {
// 				const newSubCell = createDetachedCell(`subCell-${++this.subCellCount}`);
// 				this.cell1.set(newSubCell.handle);
// 				this._expectedRoutes = [newSubCell.handle.absolutePath];
// 				this.containerRuntimeFactory.processAllMessages();
// 			}

// 			/**
// 			 * {@inheritDoc @fluid-internal/test-dds-utils#IGCTestProvider.deleteOutboundRoutes}
// 			 */
// 			public async deleteOutboundRoutes(): Promise<void> {
// 				this.cell2.delete();
// 				this._expectedRoutes = [];
// 				this.containerRuntimeFactory.processAllMessages();
// 			}

// 			/**
// 			 * {@inheritDoc @fluid-internal/test-dds-utils#IGCTestProvider.addNestedHandles}
// 			 */
// 			public async addNestedHandles(): Promise<void> {
// 				const newSubCell = createDetachedCell(`subCell-${++this.subCellCount}`);
// 				const newSubCell2 = createDetachedCell(`subCell-${++this.subCellCount}`);
// 				const containingObject = {
// 					subcellHandle: newSubCell.handle,
// 					nestedObj: {
// 						subcell2Handle: newSubCell2.handle,
// 					},
// 				};
// 				this.cell1.set(containingObject);
// 				this._expectedRoutes = [
// 					newSubCell.handle.absolutePath,
// 					newSubCell2.handle.absolutePath,
// 				];
// 				this.containerRuntimeFactory.processAllMessages();
// 			}
// 		}

// 		runGCTests(GCSharedCellProvider);
// 	});
// });
