/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeLoaderCompat, describeNoCompat } from "@fluid-internal/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils";

describe("entryPoint compat", () => {
	let provider: ITestObjectProvider;

	class TestDataObject extends DataObject {
		public get _root() {
			return this.root;
		}
		public get _context() {
			return this.context;
		}
	}

	async function getDefaultFluidObject(runtime: IContainerRuntime): Promise<FluidObject> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return (await runtime.getAliasedDataStoreEntryPoint?.("default"))!.get();
	}

	async function createContainer(): Promise<IContainer> {
		const dataObjectFactory = new DataObjectFactory("TestDataObject", TestDataObject, [], []);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataObjectFactory,
			registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			provideEntryPoint: async (runtime: IContainerRuntime) => getDefaultFluidObject(runtime),
		});

		return provider.createContainer(runtimeFactory);
	}

	describeNoCompat("no compat", (getTestObjectProvider) => {
		beforeEach(async () => {
			provider = getTestObjectProvider();
		});

		it("entryPoint pattern", async () => {
			const container = await createContainer();
			const entryPoint = await container.getEntryPoint?.();
			assert.notStrictEqual(entryPoint, undefined, "entryPoint was undefined");
		});

		it("request pattern", async () => {
			const container = await createContainer();
			const requestResult = await container.request({ url: "/" });

			assert.strictEqual(requestResult.status, 200, requestResult.value);
			assert.notStrictEqual(requestResult.value, undefined, "requestResult was undefined");
		});

		it("both entryPoint and request pattern", async () => {
			const container = await createContainer();
			const entryPoint = await container.getEntryPoint?.();
			const requestResult = await container.request({ url: "/" });

			assert.strictEqual(requestResult.status, 200, requestResult.value);
			assert.strictEqual(
				entryPoint,
				requestResult.value,
				"entryPoint and requestResult expected to be the same",
			);
		});
	});

	// Simulating old loader code
	describeLoaderCompat("loader compat", (getTestObjectProvider) => {
		beforeEach(async () => {
			provider = getTestObjectProvider();
		});

		it("request pattern works", async () => {
			const container = await createContainer();
			const requestResult = await container.request({ url: "/" });

			assert.strictEqual(requestResult.status, 200, requestResult.value);
			assert.notStrictEqual(requestResult.value, undefined, "requestResult was undefined");
		});

		it("request pattern works when entryPoint is available", async () => {
			const container = await createContainer();
			const requestResult = await container.request({ url: "/" });

			// Verify request pattern still works for older loaders (even with entryPoint available)
			assert.strictEqual(requestResult.status, 200, requestResult.value);
			assert.notStrictEqual(requestResult.value, undefined, "requestResult was undefined");
		});
	});
});
