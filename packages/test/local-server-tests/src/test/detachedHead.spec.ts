/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { DataObject } from "@fluidframework/aqueduct/internal";
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";
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
class ParentDataObject extends DataObject {
	private static instanceCount: number = 0;
	private readonly instanceNumber =
		this.context.containerRuntime.clientDetails.capabilities.interactive === false
			? -1
			: ParentDataObject.instanceCount++;

	get ParentDataObject() {
		return this;
	}

	public makeEdit(prefix: string) {
		this.root.set(`${prefix}-${this.instanceNumber}`, this.root.size);
	}

	public get state(): Record<string, unknown> {
		return [...this.root.keys()].reduce<Record<string, unknown>>((pv, cv) => {
			pv[cv] = this.root.get(cv);
			return pv;
		}, {});
	}

	public detachHead() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.context.containerRuntime.detachHead!();
	}
}

/**
 * This is the parent DataObjects factory. It specifies the child data stores
 * factory in a sub-registry. This is requires for synchronous creation of the child.
 */
const parentDataObjectFactory = new DataObjectFactory(
	"ParentDataObject",
	ParentDataObject,
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

async function getDataObject(container: IContainer): Promise<ParentDataObject> {
	const entrypoint: FluidObject<ParentDataObject> = await container.getEntryPoint();
	const dataObject = entrypoint.ParentDataObject;
	assert(dataObject !== undefined, "dataObject must be defined");
	return dataObject;
}

interface Client {
	container: IContainer;
	dataObject: ParentDataObject;
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
	const clients = {} as unknown as Record<
		"original" | "loaded",
		{ container: IContainer; dataObject: ParentDataObject }
	>;

	{
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const createContainer = await createDetachedContainer({ ...loaderProps, codeDetails });

		const original = (clients.original = {
			container: createContainer,
			dataObject: await getDataObject(createContainer),
		});
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
		const loaded = (clients.loaded = {
			dataObject: await getDataObject(loadedContainer),
			container: loadedContainer,
		});
		loaded.dataObject.makeEdit("loaded");

		await waitForSave(clients);

		assert.deepStrictEqual(
			original.dataObject.state,
			loaded.dataObject.state,
			"states should match after save",
		);
	}
	return clients;
};

describe("Scenario Test", () => {
	it("detach head and merge", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.detachHead();
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

		assert.notDeepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"should not match after save",
		);

		branchData.merge();

		await waitForSave(clients);

		assert.deepStrictEqual(
			clients.original.dataObject.state,
			clients.loaded.dataObject.state,
			"states should match after save",
		);
	});

	it("detach head  and dispose", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const clients = await createClients(deltaConnectionServer);

		const branchData = clients.original.dataObject.detachHead();
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

		branchData.dispose();

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
