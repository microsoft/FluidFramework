/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
/* eslint-disable @typescript-eslint/no-restricted-imports */
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
/* eslint-enable @typescript-eslint/no-restricted-imports */
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject } from "@fluidframework/core-interfaces";
import type { IDirectory } from "@fluidframework/map/internal";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions/internal";
import {
	defaultTestOldestSupportedClient,
	ITestObjectProvider,
} from "@fluidframework/test-utils/internal";

describe("entryPoint compat", () => {
	let provider: ITestObjectProvider;

	class TestDataObject extends DataObject {
		public get _root(): IDirectory {
			return this.root;
		}
		public get _context(): IFluidDataStoreContext {
			return this.context;
		}
	}

	async function getDefaultFluidObject(runtime: IContainerRuntime): Promise<FluidObject> {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return (await runtime.getAliasedDataStoreEntryPoint("default"))!.get();
	}

	async function createContainer(): Promise<IContainer> {
		const dataObjectFactory = new DataObjectFactory({
			type: "TestDataObject",
			ctor: TestDataObject,
		});
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataObjectFactory,
			oldestSupportedClient: defaultTestOldestSupportedClient,
			registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			provideEntryPoint: async (runtime: IContainerRuntime) => getDefaultFluidObject(runtime),
		});

		return provider.createContainer(runtimeFactory);
	}

	describeCompat("no compat", "NoCompat", (getTestObjectProvider) => {
		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider();
		});

		it("entryPoint pattern", async () => {
			const container = await createContainer();
			const entryPoint = await container.getEntryPoint();
			assert.notStrictEqual(entryPoint, undefined, "entryPoint was undefined");
		});
	});
});
