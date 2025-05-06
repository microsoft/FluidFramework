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
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { type FluidObject } from "@fluidframework/core-interfaces/internal";
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

	public addDDS(prefix: string) {
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
	 * Enumerate the data store's data, leaving handles in their encoded form.
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
		Array.isArray(clients)
			? clients
			: Object.values(clients).map(
					async (c) =>
						new Promise<void>((resolve) =>
							c.container.isDirty ? c.container.once("saved", () => resolve()) : resolve(),
						),
				),
	);

const createClients = async (deltaConnectionServer: ILocalDeltaConnectionServer) => {
	const { loaderProps, codeDetails, urlResolver } = createLoader({
		deltaConnectionServer,
		runtimeFactory,
	});

	const createContainer = await createDetachedContainer({ ...loaderProps, codeDetails });

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

describe("Staging Mode", () => {
	it("enter staging mode and merge", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assert.deepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after branch",
		);

		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		assert.notDeepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"should not match before save",
		);

		await waitForSave([clients.loaded]);

		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		assert.notDeepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"should not match after save",
		);

		const branchState = clients.original.dataObject.enumerateDataSynchronous();
		assert.notEqual(
			Object.keys(branchState).find((k) => k.startsWith("after-branch")),
			undefined,
			"Expected mainline change to reach branch",
		);

		branchData.commitChanges();

		await waitForSave(clients);

		assert.deepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after save",
		);
	});

	it("enter staging mode, create dds, and merge", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assert.deepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after branch",
		);

		clients.original.dataObject.addDDS("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		assert.notDeepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"should not match before save",
		);

		await waitForSave([clients.loaded]);

		// Wait for the mainline changes to propagate
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		assert.notDeepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"should not match after save",
		);

		const branchState = clients.original.dataObject.enumerateDataSynchronous();
		assert.notEqual(
			Object.keys(branchState).find((k) => k.startsWith("after-branch")),
			undefined,
			"Expected mainline change to reach branch",
		);

		branchData.commitChanges();

		await waitForSave(clients);

		assert.deepStrictEqual(
			await clients.original.dataObject.enumerateDataWithHandlesResolved(),
			await clients.loaded.dataObject.enumerateDataWithHandlesResolved(),
			"states should match after save",
		);
	});

	it("enter staging mode and discard staged changes", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assert.deepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after branch",
		);

		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");
		const remoteState = { ...clients.loaded.dataObject.enumerateDataSynchronous() };

		assert.notDeepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"should not match before save",
		);
		assert.deepStrictEqual(
			remoteState,
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after save",
		);

		await waitForSave([clients.loaded]);

		assert.notDeepStrictEqual(
			clients.original.dataObject.enumerateDataSynchronous(),
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"should not match after save",
		);
		assert.deepStrictEqual(
			remoteState,
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after save",
		);

		branchData.discardChanges();

		await waitForSave(clients);

		assert.deepStrictEqual(
			remoteState,
			clients.original.dataObject.enumerateDataSynchronous(),
			"states should match after save",
		);

		assert.deepStrictEqual(
			remoteState,
			clients.loaded.dataObject.enumerateDataSynchronous(),
			"states should match after save",
		);
	});
});
