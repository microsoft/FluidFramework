/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type CompatApis } from "@fluid-private/test-version-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	DataObjectFactoryType,
	getContainerEntryPointBackCompat,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import { type ITree } from "@fluidframework/tree";
import { lt } from "semver";

const treeId = "sharedTree";
const baseTestContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	runtimeOptions: {
		enableRuntimeIdCompressor: "on",
	},
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- TODO: extract schema definition and provide explicit return type
async function createTreeView(
	container: IContainer,
	dataRuntimeApi: CompatApis["dataRuntime"],
) {
	const { SchemaFactory, TreeViewConfiguration } = dataRuntimeApi.packages.tree;
	const schemaFactory = new SchemaFactory("test");
	class TestSchema extends schemaFactory.object("TestSchema", {
		foo: [schemaFactory.string],
	}) {}

	const treeViewConfig = new TreeViewConfiguration({ schema: TestSchema });

	const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
	const tree = await dataObject.getSharedObject<ITree>(treeId);
	return tree.viewWith(treeViewConfig);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- TODO: extract schema definition and provide explicit return type
async function createContainerAndGetTreeView(provider: ITestObjectProvider, apis: CompatApis) {
	const { SharedTree } = apis.dataRuntime.dds;
	const testContainerConfig: ITestContainerConfig = {
		...baseTestContainerConfig,
		registry: [[treeId, SharedTree.getFactory()]],
	};

	const container = await provider.makeTestContainer(testContainerConfig);
	return createTreeView(container, apis.dataRuntime);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- TODO: extract schema definition and provide explicit return type
async function loadContainerAndGetTreeView(provider: ITestObjectProvider, apis: CompatApis) {
	const dataRuntimeApi = apis.dataRuntimeForLoading ?? apis.dataRuntime;
	const { SharedTree } = dataRuntimeApi.dds;
	const testContainerConfig: ITestContainerConfig = {
		...baseTestContainerConfig,
		registry: [[treeId, SharedTree.getFactory()]],
	};

	const container = await provider.loadTestContainer(testContainerConfig);
	return createTreeView(container, dataRuntimeApi);
}

describeCompat(
	"SharedTree compat tests",
	"FullCompat",
	(getTestObjectProvider, apis: CompatApis) => {
		let provider: ITestObjectProvider;

		beforeEach(function () {
			provider = getTestObjectProvider();
			// SharedTree was added in version 2.0.0. Skip all cross-client compat tests in this suite for older versions.
			if (apis.mode === "CrossClientCompat") {
				const version = apis.dataRuntime.version;
				const versionForLoading = apis.dataRuntimeForLoading?.version;
				assert(
					versionForLoading !== undefined,
					"Loading version must be defined for cross-client tests",
				);
				if (lt(version, "2.0.0") || lt(versionForLoading, "2.0.0")) {
					this.skip();
				}
			}
		});

		it("simple schema", async () => {
			const treeView1 = await createContainerAndGetTreeView(provider, apis);
			assert(treeView1.compatibility.canInitialize, "Incompatible schema");
			treeView1.initialize({ foo: "Hello world" });

			const treeView2 = await loadContainerAndGetTreeView(provider, apis);
			await provider.ensureSynchronized();
			assert.deepEqual(treeView2.root.foo, "Hello world");
		});
	},
);
