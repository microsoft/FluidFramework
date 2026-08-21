/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	type ILoaderProps,
	waitContainerToCatchUp,
} from "@fluidframework/container-loader/internal";
import { isPendingLocalStateReusable } from "@fluidframework/container-runtime/legacy";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces/internal";
import type {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	getRequiredPendingLocalState,
	TestFluidObjectFactory,
	timeoutPromise,
	type ITestFluidObject,
	type LocalCodeLoader,
	type TestFluidObject,
} from "@fluidframework/test-utils/internal";
import { SchemaFactory } from "@fluidframework/tree";
import {
	type ITree,
	SharedTree,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree/internal";

import { createLoader } from "./utils.js";

const schemaFactory = new SchemaFactory("forkedPendingState");

class ForkedPendingStateRoot extends schemaFactory.object("ForkedPendingStateRoot", {
	first: schemaFactory.string,
	second: schemaFactory.string,
}) {}

const treeConfiguration = new TreeViewConfiguration({
	schema: ForkedPendingStateRoot,
});
const treeKey = "forkedPendingStateTree";

interface TestContext {
	readonly baselineState: string;
	readonly codeLoader: LocalCodeLoader;
	readonly documentServiceFactory: LocalDocumentServiceFactory;
	readonly loaderProps: ILoaderProps;
	readonly url: string;
	readonly urlResolver: LocalResolver;
}

async function waitForSaved(container: IContainer): Promise<void> {
	await waitContainerToCatchUp(container);
	if (container.isDirty) {
		await timeoutPromise((resolve) => container.once("saved", () => resolve()));
	}
}

async function getTestFluidObject(container: IContainer): Promise<ITestFluidObject> {
	const entryPoint: FluidObject<TestFluidObject> = await container.getEntryPoint();
	assert(
		entryPoint.ITestFluidObject !== undefined,
		"Expected entrypoint to be a valid TestFluidObject",
	);
	return entryPoint.ITestFluidObject;
}

async function getTreeView(
	testFluidObject: ITestFluidObject,
): Promise<TreeView<typeof ForkedPendingStateRoot>> {
	const treeHandle = testFluidObject.root.get<IFluidHandle<ITree>>(treeKey);
	assert(
		treeHandle !== undefined,
		"Expected the SharedTree handle to be stored in the root map",
	);
	const tree = await treeHandle.get();
	return tree.viewWith(treeConfiguration);
}

async function createBaseline(): Promise<TestContext> {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();
	const defaultDataStoreFactory = new TestFluidObjectFactory(
		[
			["map", SharedMap.getFactory()],
			["tree", SharedTree.getFactory()],
		],
		"default",
	);
	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
		defaultFactory: defaultDataStoreFactory,
		registryEntries: [
			[defaultDataStoreFactory.type, Promise.resolve(defaultDataStoreFactory)],
		],
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
		},
	});
	const { urlResolver, codeDetails, codeLoader, loaderProps, documentServiceFactory } =
		createLoader({ deltaConnectionServer, runtimeFactory });
	const container = await createDetachedContainer({ codeDetails, ...loaderProps });
	const testFluidObject = await getTestFluidObject(container);
	const tree = SharedTree.create(testFluidObject.runtime, treeKey);
	const view = tree.viewWith(treeConfiguration);
	view.initialize({
		first: "baseline first",
		second: "baseline second",
	});
	view.dispose();
	testFluidObject.root.set(treeKey, tree.handle);

	await container.attach(urlResolver.createCreateNewRequest("test"));
	await waitForSaved(container);
	const url = await container.getAbsoluteUrl("");
	assert(url !== undefined, "Expected container to provide a valid absolute URL");
	const baselineState = await getRequiredPendingLocalState(container);
	assert(
		isPendingLocalStateReusable(baselineState),
		"Saved state should be safe to load multiple times",
	);
	container.dispose();

	return {
		baselineState,
		codeLoader,
		documentServiceFactory,
		loaderProps,
		url,
		urlResolver,
	};
}

async function createForkedEdit(
	context: TestContext,
	field: "first" | "second",
	value: string,
): Promise<string> {
	const frozenContainer = await loadFrozenContainerFromPendingState({
		codeLoader: context.codeLoader,
		documentServiceFactory: context.documentServiceFactory,
		urlResolver: context.urlResolver,
		request: { url: context.url },
		pendingLocalState: context.baselineState,
		readOnly: false,
	});
	const testFluidObject = await getTestFluidObject(frozenContainer);
	const view = await getTreeView(testFluidObject);
	view.root[field] = value;
	view.dispose();
	const pendingState = await getRequiredPendingLocalState(frozenContainer);
	frozenContainer.dispose();
	return pendingState;
}

async function replayPendingState(
	context: TestContext,
	pendingLocalState: string,
): Promise<void> {
	const container = await loadExistingContainer({
		...context.loaderProps,
		request: { url: context.url },
		pendingLocalState,
	});
	await waitForSaved(container);
	container.dispose();
}

async function readTree(context: TestContext): Promise<{
	readonly first: string;
	readonly second: string;
}> {
	const container = await loadExistingContainer({
		...context.loaderProps,
		request: { url: context.url },
	});
	await waitContainerToCatchUp(container);
	const testFluidObject = await getTestFluidObject(container);
	const view = await getTreeView(testFluidObject);
	const result = {
		first: view.root.first,
		second: view.root.second,
	};
	view.dispose();
	container.dispose();
	return result;
}

describe("forked pending local state", () => {
	it("preserves disjoint SharedTree edits replayed from the same baseline", async () => {
		const context = await createBaseline();
		const firstEdit = await createForkedEdit(context, "first", "edited first");
		await replayPendingState(context, firstEdit);
		const secondEdit = await createForkedEdit(context, "second", "edited second");
		await replayPendingState(context, secondEdit);

		assert.deepStrictEqual(await readTree(context), {
			first: "edited first",
			second: "edited second",
		});
	});
});
