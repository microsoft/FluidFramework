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
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

/**
 * This is the parent DataObject, which is also a datastore. It has a
 * synchronous method to create child datastores, which could be called
 * in response to synchronous user input, like a key press.
 */
class RootDataObject extends DataObject {
	private static instanceCount: number = 0;
	private readonly instanceNumber =
		this.context.containerRuntime.clientDetails.capabilities.interactive === false
			? -1
			: RootDataObject.instanceCount++;

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

	public get state(): Record<string, unknown> {
		return [...this.root.keys()].reduce<Record<string, unknown>>((pv, cv) => {
			const value = (pv[cv] = this.root.get(cv));
			if (isFluidHandle(value)) {
				pv[cv] = toFluidHandleInternal(value).absolutePath;
			}
			return pv;
		}, {});
	}

	public async loadState(): Promise<Record<string, unknown>> {
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
		return this.context.containerRuntime.enterStagingMode();
	}
}

/**
 * This is the parent DataObjects factory. It specifies the child data stores
 * factory in a sub-registry. This is requires for synchronous creation of the child.
 */
const parentDataObjectFactory = new DataObjectFactory(
	"ParentDataObject",
	RootDataObject,
	undefined,
	{},
);

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
			registryEntries: [
				[
					parentDataObjectFactory.type,
					// the parent is still async in the container registry
					// this allows things like code splitting for dynamic loading
					Promise.resolve(parentDataObjectFactory),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(parentDataObjectFactory.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

async function getDataObject(container: IContainer): Promise<RootDataObject> {
	const entrypoint: FluidObject<RootDataObject> = await container.getEntryPoint();
	const dataObject = entrypoint.ParentDataObject;
	assert(dataObject !== undefined, "dataObject must be defined");
	return dataObject;
}

interface Client {
	container: IContainer;
	dataObject: RootDataObject;
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
		original.dataObject.state,
		loaded.dataObject.state,
		"initial states should match after save",
	);

	return clients;
};

describe("Scenario Test", () => {
	it("enter staging mode and merge", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assert.deepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"states should match after branch",
		);

		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match before save",
		);

		await waitForSave([clients.loaded]);

		// Wait for the mainline changes to propagate
		//* TODO: Need some of e2e test utils like ContainerLoaderTracker to properly wait here
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match after save",
		);

		const branchState = clients.original.dataObject.state;
		assert.notEqual(
			Object.keys(branchState).find((k) => k.startsWith("after-branch")),
			undefined,
			"Expected mainline change to reach branch",
		);

		branchData.commitChanges();

		await waitForSave(clients);

		assert.deepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"states should match after save",
		);
	});

	it("enter staging mode, create dds, and merge", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assert.deepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"states should match after branch",
		);

		clients.original.dataObject.addDDS("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match before save",
		);

		await waitForSave([clients.loaded]);

		// Wait for the mainline changes to propagate
		//* TODO: Need some of e2e test utils like ContainerLoaderTracker to properly wait here
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match after save",
		);

		const branchState = clients.original.dataObject.state;
		assert.notEqual(
			Object.keys(branchState).find((k) => k.startsWith("after-branch")),
			undefined,
			"Expected mainline change to reach branch",
		);

		branchData.commitChanges();

		await waitForSave(clients);

		assert.deepStrictEqual(
			await clients.original.dataObject.loadState(),
			await clients.loaded.dataObject.loadState(),
			"states should match after save",
		);
	});

	it("enter staging mode and discard staged changes", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.enterStagingMode();
		assert.deepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"states should match after branch",
		);

		clients.original.dataObject.makeEdit("branch-only");
		clients.loaded.dataObject.makeEdit("after-branch");
		const remoteState = { ...clients.loaded.dataObject.state };

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match before save",
		);
		assert.deepStrictEqual(
			remoteState,
			clients.loaded.dataObject.state,
			"states should match after save",
		);

		await waitForSave([clients.loaded]);

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match after save",
		);
		assert.deepStrictEqual(
			remoteState,
			clients.loaded.dataObject.state,
			"states should match after save",
		);

		branchData.discardChanges();

		await waitForSave(clients);

		assert.deepStrictEqual(
			remoteState,
			clients.original.dataObject.state,
			"states should match after save",
		);

		assert.deepStrictEqual(
			remoteState,
			clients.loaded.dataObject.state,
			"states should match after save",
		);
	});
});
