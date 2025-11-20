/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import {
	type IContainer,
	type IRuntime,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	ConnectionState,
	type ContainerAlpha,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import {
	IContainerRuntimeOptions,
	loadContainerRuntimeAlpha,
} from "@fluidframework/container-runtime/internal";
import {
	type ConfigTypes,
	type FluidObject,
	type IConfigProviderBase,
	type IErrorBase,
} from "@fluidframework/core-interfaces/internal";
import type { SessionSpaceCompressedId } from "@fluidframework/id-compressor/internal";
import { SharedMap } from "@fluidframework/map/internal";
import {
	asLegacyAlpha,
	type StageControlsInternal,
} from "@fluidframework/runtime-definitions/internal";
import {
	encodeHandleForSerialization,
	isFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import type { SharedObject } from "@fluidframework/shared-object-base/internal";
import { LoggingError, wrapError } from "@fluidframework/telemetry-utils/internal";
import sinon from "sinon";

import { createLoader } from "../utils.js";

/**
 * A DataObject implementation that is used to test Staging Mode.
 * Supports entering staging mode, adding new DDSes, and concisely enumerating the data store's data.
 */
class DataObjectWithStagingMode extends DataObject {
	private static instanceCount: number = 0;
	private readonly instanceNumber =
		this.context.containerRuntime.clientDetails.capabilities.interactive === false
			? -1
			: DataObjectWithStagingMode.instanceCount++;

	private readonly containerRuntimeExp = asLegacyAlpha(this.context.containerRuntime);
	get DataObjectWithStagingMode() {
		return this;
	}
	get containerRuntime() {
		return this.context.containerRuntime;
	}

	private generateCompressedId(): SessionSpaceCompressedId {
		const idCompressor = this.runtime.idCompressor;
		assert(idCompressor !== undefined, "IdCompressor must be enabled for these tests.");
		return idCompressor.generateCompressedId();
	}

	/** Add to the root map including prefix in the key name, and a compressed ID in the value (for ID Compressor test coverage) */
	public makeEdit(prefix: string) {
		const compressedId = this.generateCompressedId();
		this.root.set(`${prefix}-${this.instanceNumber}`, {
			n: this.root.size,
			someId: compressedId,
		});
	}

	public addDDS(prefix: string): void {
		const newMap = SharedMap.create(this.runtime);
		newMap.set("self", `${prefix}-${this.instanceNumber}`);
		this.root.set(`${prefix}-${this.instanceNumber}`, newMap.handle);
	}

	/**
	 * Enumerate the data store's data, encoding handles to get a synchronously-available representation.
	 */
	public enumerateDataSynchronous(): Record<string, unknown> {
		return [...this.root.keys()].reduce<Record<string, unknown>>((pv, cv) => {
			const value = (pv[cv] = this.root.get(cv));
			if (isFluidHandle(value)) {
				pv[cv] = encodeHandleForSerialization(toFluidHandleInternal(value));
			}
			return pv;
		}, {});
	}

	/**
	 * Enumerate the data store's data, traversing handles to other DDSes and including their data as nested keys.
	 */
	public async enumerateDataWithHandlesResolved(): Promise<Record<string, unknown>> {
		const loadStateInt = async (map) => {
			const state: Record<string, unknown> = {};
			for (const key of map.keys()) {
				const value = (state[key] = map.get(key));
				if (isFluidHandle(value)) {
					state[key] = await loadStateInt(await value.get());
				}
			}
			return state;
		};
		return loadStateInt(this.root);
	}

	public enterStagingMode(): StageControlsInternal {
		assert(
			this.containerRuntimeExp.enterStagingMode !== undefined,
			"enterStagingMode must be defined",
		);
		return this.containerRuntimeExp.enterStagingMode();
	}
}

const dataObjectFactory = new DataObjectFactory({
	type: "TheDataObject",
	ctor: DataObjectWithStagingMode,
	policies: {
		readonlyInStagingMode: false,
	},
});

// a simple container runtime factory with a single datastore aliased as default.
// the default datastore is also returned as the entrypoint
const runtimeFactory: IRuntimeFactory = {
	get IRuntimeFactory() {
		return this;
	},
	instantiateRuntime: async (context, existing): Promise<IRuntime> => {
		const runtimeOptions: IContainerRuntimeOptions = {
			enableRuntimeIdCompressor: "on",
		};
		const { runtime } = await loadContainerRuntimeAlpha({
			context,
			existing,
			registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			runtimeOptions,
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(dataObjectFactory.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get() as FluidObject;
			},
		});
		return runtime;
	},
};

async function getDataObject(container: IContainer): Promise<DataObjectWithStagingMode> {
	const entrypoint: FluidObject<DataObjectWithStagingMode> = await container.getEntryPoint();
	const dataObject = entrypoint.DataObjectWithStagingMode;
	assert(dataObject !== undefined, "dataObject must be defined");
	return dataObject;
}

interface Client {
	container: IContainer;
	dataObject: DataObjectWithStagingMode;
}

/** Returns the max sequence number from the clients once each has had its local state saved */
const waitForSave = async (clients: Client[] | Record<string, Client>): Promise<number> =>
	Promise.all(
		Object.entries(clients).map(
			async ([key, { container }]) =>
				new Promise<number>((resolve, reject) => {
					if (container.closed || container.disposed) {
						reject(
							new Error(
								`Container ${key} already closed or disposed when waitForSave was called`,
							),
						);
						return;
					}

					if (!container.isDirty) {
						resolve(container.deltaManager.lastSequenceNumber);
						return;
					}

					const rejectHandler = (error?: IErrorBase | undefined) => {
						reject(
							wrapError(
								error,
								(message) =>
									new LoggingError(`Container "${key}" closed or disposed: ${message}`),
							),
						);
						off();
					};

					const resolveHandler = () => {
						resolve(container.deltaManager.lastSequenceNumber);
						off();
					};

					const off = () => {
						container.off("closed", rejectHandler);
						container.off("disposed", rejectHandler);
						container.off("saved", resolveHandler);
					};

					container.on("saved", resolveHandler);
					container.on("closed", rejectHandler);
					container.on("disposed", rejectHandler);
				}),
		),
	).then((sequenceNumbers) => Math.max(...sequenceNumbers));

/** Wait for all clients to process the given sequenceNumber */
const catchUp = async (clients: Client[] | Record<string, Client>, sequenceNumber: number) => {
	return Promise.all(
		Object.entries(clients).map(
			async ([key, { container }]) =>
				new Promise<void>((resolve, reject) => {
					if (container.closed || container.disposed) {
						reject(
							new Error(
								`Container ${key} already closed or disposed when waitForCaughtUp was called`,
							),
						);
						return;
					}

					if (container.deltaManager.lastSequenceNumber >= sequenceNumber) {
						resolve();
						return;
					}

					const rejectHandler = (error?: IErrorBase | undefined) => {
						reject(
							wrapError(
								error,
								(message) =>
									new LoggingError(`Container "${key}" closed or disposed: ${message}`),
							),
						);
						off();
					};

					const opHandler = (message) => {
						if (message.sequenceNumber >= sequenceNumber) {
							resolve();
							off();
						}
					};

					const off = () => {
						container.off("op", opHandler);
						container.off("closed", rejectHandler);
						container.off("disposed", rejectHandler);
					};

					container.on("op", opHandler);
					container.on("closed", rejectHandler);
					container.on("disposed", rejectHandler);
				}),
		),
	);
};

const createClients = async (deltaConnectionServer: ILocalDeltaConnectionServer) => {
	const {
		loaderProps: baseLoaderProps,
		codeDetails,
		urlResolver,
	} = createLoader({
		deltaConnectionServer,
		runtimeFactory,
	});

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes =>
			settings[name] ?? baseLoaderProps.configProvider?.getRawConfig(name),
	});

	const loaderProps = {
		...baseLoaderProps,
		configProvider: configProvider({
			"Fluid.SharedObject.AllowStagingModeWithoutSquashing": true,
		}),
	};

	const createContainer = await createDetachedContainer({
		...loaderProps,
		codeDetails,
	});

	const original = {
		container: createContainer,
		dataObject: await getDataObject(createContainer),
	};
	original.dataObject.makeEdit("detached");

	await createContainer.attach(urlResolver.createCreateNewRequest("test"));
	original.dataObject.makeEdit("attached");

	const url = await createContainer.getAbsoluteUrl("");
	assert(url !== undefined, "must have url");

	const loadLoader = createLoader({
		deltaConnectionServer,
		runtimeFactory,
	});

	const loadedContainer = await loadExistingContainer({
		...loadLoader.loaderProps,
		request: { url },
	});
	const loaded = {
		dataObject: await getDataObject(loadedContainer),
		container: loadedContainer,
	};
	loaded.dataObject.makeEdit("loaded");

	const clients = { original, loaded };

	await waitForSave(clients);

	assert.deepStrictEqual(
		original.dataObject.enumerateDataSynchronous(),
		loaded.dataObject.enumerateDataSynchronous(),
		"initial states should match after save",
	);

	return clients;
};

/**
 * Verify clients are consistent via their data representation from `enumerateDataWithHandlesResolved`, which
 * loads DDSes created by `addDDS`.
 */
async function assertDeepConsistent(
	clients: Awaited<ReturnType<typeof createClients>>,
	message: string,
): Promise<void> {
	const { original, loaded } = clients;
	assert.deepStrictEqual(
		await original.dataObject.enumerateDataWithHandlesResolved(),
		await loaded.dataObject.enumerateDataWithHandlesResolved(),
		message,
	);
}

/**
 * Verify clients are consistent via their data representation from `enumerateDataSynchronous`.
 */
function assertConsistent(
	clients: Awaited<ReturnType<typeof createClients>>,
	message: string,
): void {
	const { original, loaded } = clients;
	assert.deepStrictEqual(
		original.dataObject.enumerateDataSynchronous(),
		loaded.dataObject.enumerateDataSynchronous(),
		message,
	);
}

/**
 * Verify clients are not consistent via their data representation from `enumerateDataSynchronous`.
 */
function assertNotConsistent(
	clients: Awaited<ReturnType<typeof createClients>>,
	message: string,
): void {
	const { original, loaded } = clients;
	assert.notDeepStrictEqual(
		original.dataObject.enumerateDataSynchronous(),
		loaded.dataObject.enumerateDataSynchronous(),
		message,
	);
}

/**
 * @returns Whether the given client has received an edit from some client (including itself) with the given prefix.
 */
function hasEdit(client: Client, prefix: string): boolean {
	return Object.keys(client.dataObject.enumerateDataSynchronous()).some((k) =>
		k.startsWith(prefix),
	);
}

async function ensureDisconnected(client: Client): Promise<void> {
	return new Promise<void>((resolve) => {
		if (client.container.connectionState === ConnectionState.Disconnected) {
			resolve();
		} else {
			client.container.once("disconnected", () => resolve());
			client.container.disconnect();
		}
	});
}

async function ensureConnected(client: Client): Promise<void> {
	return new Promise<void>((resolve) => {
		if (client.container.connectionState === ConnectionState.Connected) {
			resolve();
		} else {
			client.container.once("connected", () => resolve());
			client.container.connect();
		}
	});
}

describe("Staging Mode", () => {
	it("entering staging mode does not change the data model", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);
		clients.original.dataObject.enterStagingMode();
		assertConsistent(clients, "states should match after branch");
	});

	it("blocks outbound changes", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);
		clients.original.dataObject.enterStagingMode();
		clients.original.dataObject.makeEdit("branch-only");

		assertNotConsistent(clients, "should not match before save");

		const seq = await waitForSave([clients.loaded]);
		await catchUp(clients, seq);

		assertNotConsistent(clients, "should not match after save");
		assert.equal(
			hasEdit(clients.original, "branch-only"),
			true,
			"Staging mode client should have its own change",
		);
		assert.equal(
			hasEdit(clients.loaded, "branch-only"),
			false,
			"Loaded client should not have the change",
		);
	});

	it("allows inbound changes to flow", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);
		clients.original.dataObject.enterStagingMode();
		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		const seq = await waitForSave([clients.loaded]);
		await catchUp(clients, seq);

		assert.equal(
			hasEdit(clients.original, "after-branch"),
			true,
			"Staging mode client should have received remote change",
		);
	});

	it("commitChanges sends changes applied to other clients", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const stagingControls = clients.original.dataObject.enterStagingMode();
		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		const seq = await waitForSave([clients.loaded]);
		await catchUp(clients, seq);

		// Make another change before exiting staging mode
		clients.original.dataObject.makeEdit("branch-second-batch");

		stagingControls.commitChanges();

		await waitForSave(clients);

		assertConsistent(clients, "states should match after save");
		assert.equal(
			hasEdit(clients.original, "branch-only") &&
				hasEdit(clients.original, "branch-second-batch"),
			true,
			"Edit submitted while in staging mode should be committed.",
		);
	});

	it("discardChanges rolls back all changes applied in staging mode", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const stagingControls = clients.original.dataObject.enterStagingMode();
		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		const seq = await waitForSave([clients.loaded]);
		await catchUp(clients, seq);

		// Make another change before exiting staging mode
		clients.original.dataObject.makeEdit("branch-second-batch");

		stagingControls.discardChanges();

		await waitForSave(clients);

		assertConsistent(clients, "states should match after save");
		assert.equal(
			hasEdit(clients.original, "branch-"), // branch-only or branch-second-batch
			false,
			"Edit submitted while in staging mode should be rolled back.",
		);
	});

	// Analogous to the basic behavioral tests for staging mode above, but is worth testing separately as it involves
	// an attach op for the created DDS.
	it("enter staging mode, create dds, and merge", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assertConsistent(clients, "states should match after branch");

		clients.original.dataObject.addDDS("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		assertNotConsistent(clients, "should not match before save");

		const seq = await waitForSave([clients.loaded]);
		await catchUp(clients, seq);

		assertNotConsistent(clients, "should not match after save");

		const branchState = clients.original.dataObject.enumerateDataSynchronous();
		assert.notEqual(
			Object.keys(branchState).find((k) => k.startsWith("after-branch")),
			undefined,
			"Expected mainline change to reach branch",
		);

		branchData.commitChanges();

		await waitForSave(clients);

		await assertDeepConsistent(clients, "states should match after save");
	});

	for (const commit of [false, true]) {
		it(`${commit ? "commitChanges" : "discardChanges"} allows subsequent outbound changes to flow`, async () => {
			const deltaConnectionServer = LocalDeltaConnectionServer.create();
			const clients = await createClients(deltaConnectionServer);
			const stagingControls = clients.original.dataObject.enterStagingMode();
			clients.original.dataObject.makeEdit("branch-only");
			if (commit) {
				stagingControls.commitChanges();
			} else {
				stagingControls.discardChanges();
			}

			await waitForSave(clients);
			assertConsistent(clients, "states should match after save");

			clients.original.dataObject.makeEdit("after staging mode");
			await waitForSave(clients);
			assertConsistent(clients, "states should match after second save");
			assert.equal(
				hasEdit(clients.loaded, "after staging mode"),
				true,
				"Edit made after staging mode ends should be sent",
			);
		});
	}

	it("can be exited while disconnected and functionality is preserved", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);
		const stagingControls = clients.original.dataObject.enterStagingMode();
		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		await waitForSave([clients.loaded]);
		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		await ensureDisconnected(clients.original);
		stagingControls.commitChanges();
		await ensureConnected(clients.original);

		await waitForSave(clients);

		assertConsistent(clients, "states should match after save");
		assert.equal(
			hasEdit(clients.original, "branch-only"),
			true,
			"Edit submitted while in staging mode should be committed.",
		);
	});

	for (const { disconnectBeforeCommit, squash } of generatePairwiseOptions({
		disconnectBeforeCommit: [false, true],
		squash: [undefined, false, true],
	})) {
		it(`respects squash=${squash} when exiting staging mode ${disconnectBeforeCommit ? "while disconnected" : ""}`, async () => {
			const deltaConnectionServer = LocalDeltaConnectionServer.create();
			const clients = await createClients(deltaConnectionServer);

			// Use Sinon to spy on the methods
			// eslint-disable-next-line @typescript-eslint/dot-notation
			const rootMap = clients.original.dataObject["root"] as unknown as SharedObject;
			const reSubmitSquashedSpy = sinon.spy(rootMap, "reSubmitSquashed" as keyof SharedObject);
			const reSubmitCoreSpy = sinon.spy(rootMap, "reSubmitCore" as keyof SharedObject);

			const stagingControls = clients.original.dataObject.enterStagingMode();
			clients.original.dataObject.makeEdit("branch-only");

			if (disconnectBeforeCommit) {
				await ensureDisconnected(clients.original);
			}
			stagingControls.commitChanges({ squash });
			if (disconnectBeforeCommit) {
				await ensureConnected(clients.original);
			}

			await waitForSave(clients);

			assertConsistent(clients, "States should match after save");
			assert.equal(
				reSubmitSquashedSpy.callCount,
				squash === true ? 1 : 0,
				"Squashed resubmit should be called iff squash = true.",
			);
			if (squash === true) {
				assert(
					JSON.stringify(reSubmitSquashedSpy.args[0][0]).includes("branch-only"),
					"Squashed op should contain the edit prefix.",
				);
			} else {
				assert.equal(
					reSubmitCoreSpy.callCount,
					// 2 resubmits when disconnected happens because there is one resubmit upon exiting staging mode (to clear staging flags),
					// then another when we eventually reconnect.
					disconnectBeforeCommit ? 2 : 1,
					"Normal resubmit should be called when squash = false.",
				);
				assert(
					JSON.stringify(reSubmitCoreSpy.args[0][0]).includes("branch-only"),
					"Normal resubmit op should contain the edit prefix.",
				);
			}

			// Restore the spied methods
			reSubmitSquashedSpy.restore();
			reSubmitCoreSpy.restore();
		});
	}

	it("Aliasing a datastore not supported in staging mode", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		clients.original.dataObject.enterStagingMode();

		// Create and alias a new datastore in staging mode
		const newDataStore = await clients.original.dataObject.containerRuntime.createDataStore(
			dataObjectFactory.type,
		);

		await assert.rejects(
			async () => newDataStore.trySetAlias("staged-alias"),
			/Cannot set aliases while in staging mode/,
			"Should not be able to set an alias in staging mode",
		);
	});

	describe("Pending state rehydration", () => {
		it("rehydrates pending DDS from pending state", async () => {
			const deltaConnectionServer = LocalDeltaConnectionServer.create();
			const clients = await createClients(deltaConnectionServer);

			// Enter staging mode and create a new DDS
			clients.original.dataObject.enterStagingMode();
			clients.original.dataObject.addDDS("pendingDDS");

			// Get the pending local state before committing
			const pendingState = await (
				clients.original.container as ContainerAlpha
			).getPendingLocalState();
			assert(pendingState !== undefined, "Pending state should exist");

			// Close the original container
			clients.original.container.close();

			// Create a new loader and rehydrate from pending state
			const rehydrateLoader = createLoader({
				deltaConnectionServer,
				runtimeFactory,
			});

			const url = await clients.loaded.container.getAbsoluteUrl("");
			assert(url !== undefined, "must have url");

			const rehydratedContainer = await loadExistingContainer({
				...rehydrateLoader.loaderProps,
				request: { url },
				pendingLocalState: pendingState,
			});

			const rehydratedDataObject = await getDataObject(rehydratedContainer);

			// Verify the container is in staging mode
			const runtimeAlpha = asLegacyAlpha(rehydratedDataObject.containerRuntime);
			assert(runtimeAlpha.inStagingMode, "Rehydrated container should be in staging mode");

			// The rehydrated container should have the pending DDS loaded
			const rehydratedData = await rehydratedDataObject.enumerateDataWithHandlesResolved();
			assert(
				rehydratedData["pendingDDS-0"] !== undefined,
				"Rehydrated container should have pending DDS",
			);
		});

		it("rehydrates multiple pending datastores with DDS", async () => {
			const deltaConnectionServer = LocalDeltaConnectionServer.create();
			const clients = await createClients(deltaConnectionServer);

			// Enter staging mode
			clients.original.dataObject.enterStagingMode();

			// Create multiple datastores with DDS
			for (let i = 0; i < 3; i++) {
				const newDataStore =
					await clients.original.dataObject.containerRuntime.createDataStore(
						dataObjectFactory.type,
					);
				const newDataObject =
					(await newDataStore.entryPoint.get()) as DataObjectWithStagingMode;

				// Create a DDS in each datastore
				newDataObject.addDDS(`dds-in-ds-${i}`);
				newDataObject.makeEdit(`edit-in-ds-${i}`);
			}

			// Get the pending local state before committing
			const pendingState = await (
				clients.original.container as ContainerAlpha
			).getPendingLocalState();
			assert(pendingState !== undefined, "Pending state should exist");

			// Close the original container
			clients.original.container.close();

			// Create a new loader and rehydrate from pending state
			const rehydrateLoader = createLoader({
				deltaConnectionServer,
				runtimeFactory,
			});

			const url = await clients.loaded.container.getAbsoluteUrl("");
			assert(url !== undefined, "must have url");

			const rehydratedContainer = await loadExistingContainer({
				...rehydrateLoader.loaderProps,
				request: { url },
				pendingLocalState: pendingState,
			});

			const rehydratedDataObject = await getDataObject(rehydratedContainer);

			// Verify the container is in staging mode
			const runtimeAlpha = asLegacyAlpha(rehydratedDataObject.containerRuntime);
			assert(runtimeAlpha.inStagingMode, "Rehydrated container should be in staging mode");

			// The rehydrated container should have all the pending datastores loaded
			const rehydratedData = await rehydratedDataObject.enumerateDataWithHandlesResolved();

			// Verify all pending edits are present in the rehydrated container
			for (let i = 0; i < 3; i++) {
				const editKey = `edit-in-ds-${i}-`;
				const foundEdit = Object.keys(rehydratedData).some((key) => key.startsWith(editKey));
				assert(foundEdit, `Rehydrated container should have edit from datastore ${i}`);
			}
		});
	});
});
