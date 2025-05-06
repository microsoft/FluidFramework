/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import {
	type IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	ConnectionState,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import {
	type ConfigTypes,
	type FluidObject,
	type IConfigProviderBase,
	type IErrorBase,
} from "@fluidframework/core-interfaces/internal";
import { SharedMap } from "@fluidframework/map/internal";
import type { IContainerRuntimeBaseExperimental } from "@fluidframework/runtime-definitions/internal";
import {
	encodeHandleForSerialization,
	isFluidHandle,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { LoggingError, wrapError } from "@fluidframework/telemetry-utils/internal";

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

	private readonly containerRuntimeExp: IContainerRuntimeBaseExperimental =
		this.context.containerRuntime;
	get ParentDataObject() {
		return this;
	}

	public makeEdit(prefix: string) {
		this.root.set(`${prefix}-${this.instanceNumber}`, this.root.size);
	}

	public addDDS(prefix: string): void {
		const newMap = SharedMap.create(this.runtime);
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
		const state: Record<string, unknown> = {};
		const loadStateInt = async (map) => {
			for (const key of map.keys()) {
				const value = (state[key] = map.get(key));
				if (isFluidHandle(value)) {
					state[key] = await loadStateInt(await value.get());
				}
			}
		};
		await loadStateInt(this.root);
		return state;
	}

	public enterStagingMode() {
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
});

// a simple container runtime factory with a single datastore aliased as default.
// the default datastore is also returned as the entrypoint
const runtimeFactory: IRuntimeFactory = {
	get IRuntimeFactory() {
		return this;
	},
	instantiateRuntime: async (context, existing) => {
		return loadContainerRuntime({
			context,
			existing,
			registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(dataObjectFactory.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

async function getDataObject(container: IContainer): Promise<DataObjectWithStagingMode> {
	const entrypoint: FluidObject<DataObjectWithStagingMode> = await container.getEntryPoint();
	const dataObject = entrypoint.ParentDataObject;
	assert(dataObject !== undefined, "dataObject must be defined");
	return dataObject;
}

interface Client {
	container: IContainer;
	dataObject: DataObjectWithStagingMode;
}

const waitForSave = async (clients: Client[] | Record<string, Client>) =>
	Promise.all(
		Object.entries(clients).map(
			async ([key, { container }]) =>
				new Promise<void>((resolve, reject) => {
					if (container.closed || container.disposed) {
						reject(
							new Error(
								`Container ${key} already closed or disposed when waitForSave was called`,
							),
						);
						return;
					}

					if (!container.isDirty) {
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

					const resolveHandler = () => {
						resolve();
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
	);

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

type Await<T> = T extends PromiseLike<infer U> ? Await<U> : T;

/**
 * Verify clients are consistent via their data representation from `enumerateDataWithHandlesResolved`, which
 * loads DDSes created by `addDDS`.
 */
async function assertDeepConsistent(
	clients: Await<ReturnType<typeof createClients>>,
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
	clients: Await<ReturnType<typeof createClients>>,
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
	clients: Await<ReturnType<typeof createClients>>,
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

		await waitForSave([clients.loaded]);
		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

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

		await waitForSave([clients.loaded]);
		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

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

		await waitForSave([clients.loaded]);
		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		stagingControls.commitChanges();

		await waitForSave(clients);

		assertConsistent(clients, "states should match after save");
		assert.equal(
			hasEdit(clients.original, "branch-only"),
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

		await waitForSave([clients.loaded]);
		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		stagingControls.discardChanges();

		await waitForSave(clients);

		assertConsistent(clients, "states should match after save");
		assert.equal(
			hasEdit(clients.original, "branch-only"),
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

		await waitForSave([clients.loaded]);
		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

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
});
