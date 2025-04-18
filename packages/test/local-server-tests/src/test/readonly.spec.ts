/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { type IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	type ILoadExistingContainerProps,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { type FluidObject } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

class DefaultDataObject extends DataObject {
	get DefaultDataObject() {
		return this;
	}
	get readonly() {
		return this.runtime.readonly;
	}

	protected async hasInitialized(): Promise<void> {
		this.runtime.on("readonly", () => this.readonlyEventCount++);
	}

	public readonlyEventCount: number = 0;
}
const defaultDataObjectFactory = new DataObjectFactory(
	"DefaultDataObject",
	DefaultDataObject,
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
					defaultDataObjectFactory.type,
					// the parent is still async in the container registry
					// this allows things like code splitting for dynamic loading
					Promise.resolve(defaultDataObjectFactory),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(defaultDataObjectFactory.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

async function createContainerAndGetLoadProps(): Promise<ILoadExistingContainerProps> {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();

	const { loaderProps, codeDetails, urlResolver } = createLoader({
		deltaConnectionServer,
		runtimeFactory,
	});

	const container = await createDetachedContainer({ ...loaderProps, codeDetails });
	await container.getEntryPoint();

	await container.attach(urlResolver.createCreateNewRequest("test"));
	const url = await container.getAbsoluteUrl("");
	assert(url !== undefined, "container must have url");
	container.dispose();
	return { ...loaderProps, request: { url } };
}

describe("readonly", () => {
	it("Readonly is correct across container create", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const container = await createDetachedContainer({ ...loaderProps, codeDetails });

		const entrypoint: FluidObject<DefaultDataObject> = await container.getEntryPoint();

		assert(
			entrypoint.DefaultDataObject !== undefined,
			"container entrypoint must be DefaultDataObject",
		);

		assert(entrypoint.DefaultDataObject.readonly === false, "shouldn't be readonly");
		assert(
			entrypoint.DefaultDataObject.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);

		await container.attach(urlResolver.createCreateNewRequest("test"));

		assert(entrypoint.DefaultDataObject.readonly === false, "shouldn't be readonly");
		assert(
			entrypoint.DefaultDataObject.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);
	});

	it("Readonly is correct after container load", async () => {
		const loadedContainer = await loadExistingContainer(
			await createContainerAndGetLoadProps(),
		);

		const entrypoint: FluidObject<DefaultDataObject> = await loadedContainer.getEntryPoint();

		assert(
			entrypoint.DefaultDataObject !== undefined,
			"container entrypoint must be DefaultDataObject",
		);

		assert(entrypoint.DefaultDataObject.readonly === false, "shouldn't be readonly");
		assert(
			entrypoint.DefaultDataObject.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);
	});

	it("Readonly is correct after datastore load and forceReadonly", async () => {
		const loadedContainer = await loadExistingContainer(
			await createContainerAndGetLoadProps(),
		);

		const entrypoint: FluidObject<DefaultDataObject> = await loadedContainer.getEntryPoint();

		assert(
			entrypoint.DefaultDataObject !== undefined,
			"container entrypoint must be DefaultDataObject",
		);

		loadedContainer.forceReadonly?.(true);

		assert(entrypoint.DefaultDataObject.readonly === true, "should be readonly");
		assert(
			entrypoint.DefaultDataObject.readonlyEventCount === 1,
			"should be any readonly events",
		);
	});

	it("Readonly is correct after forceReadonly before datastore load", async () => {
		const loadedContainer = await loadExistingContainer(
			await createContainerAndGetLoadProps(),
		);

		loadedContainer.forceReadonly?.(true);

		const entrypoint: FluidObject<DefaultDataObject> = await loadedContainer.getEntryPoint();

		assert(
			entrypoint.DefaultDataObject !== undefined,
			"container entrypoint must be DefaultDataObject",
		);

		assert(entrypoint.DefaultDataObject.readonly === true, "should be readonly");
		assert(
			entrypoint.DefaultDataObject.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);
	});
});
