/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	describeCompat,
	describeInstallVersions,
	getVersionedTestObjectProvider,
} from "@fluid-private/test-version-utils";
// TODO:AB#6558: describeInstallVersions doesn't support dynamically providing package APIs.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import { pkgVersion } from "../packageVersion.js";

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
		const dataObjectFactory = new DataObjectFactory({
			type: "TestDataObject",
			ctor: TestDataObject,
		});
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: dataObjectFactory,
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
			const entryPoint = await container.getEntryPoint?.();
			assert.notStrictEqual(entryPoint, undefined, "entryPoint was undefined");
		});
	});

	const loaderWithRequest = "2.0.0-internal.7.0.0";
	describeInstallVersions({
		requestAbsoluteVersions: [loaderWithRequest],
	})("loader compat", (_) => {
		beforeEach("getVersionedTestObjectProvider", async () => {
			provider = await getVersionedTestObjectProvider(
				pkgVersion, // base version
				loaderWithRequest,
			);
		});

		afterEach(() => {
			provider.reset();
		});

		it("request pattern works", async () => {
			const container = await createContainer();
			const requestResult = await (container as any).request({ url: "/" });

			assert.strictEqual(requestResult.status, 200, requestResult.value);
			assert.notStrictEqual(requestResult.value, undefined, "requestResult was undefined");
		});

		it("request pattern works when entryPoint is available", async () => {
			const container = await createContainer();
			const requestResult = await (container as any).request({ url: "/" });

			// Verify request pattern still works for older loaders (even with entryPoint available)
			assert.strictEqual(requestResult.status, 200, requestResult.value);
			assert.notStrictEqual(requestResult.value, undefined, "requestResult was undefined");
		});
	});
});
