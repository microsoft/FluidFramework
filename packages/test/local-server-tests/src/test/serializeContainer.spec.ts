/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import type {
	IContainer,
	IFluidCodeDetails,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	rehydrateDetachedContainer,
	waitContainerToCatchUp,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { asLegacyAlpha } from "@fluidframework/container-loader/legacy/alpha";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces/internal";
import type { LocalResolver } from "@fluidframework/local-driver/internal";
import { SharedMap } from "@fluidframework/map/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	getRequiredPendingLocalState,
	TestFluidObjectFactory,
	timeoutPromise,
	type ITestFluidObject,
	type TestFluidObject,
} from "@fluidframework/test-utils/internal";
import { SchemaFactory } from "@fluidframework/tree";
import {
	SharedTree,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree/internal";

import { createLoader } from "./utils.js";

const schemaFactory = new SchemaFactory("serializeContainer");
class SerializationRoot extends schemaFactory.object("Root", {
	first: schemaFactory.string,
	second: schemaFactory.string,
}) {}
const treeConfiguration = new TreeViewConfiguration({ schema: SerializationRoot });
const treeKey = "serializationTree";

async function getDataObject(container: IContainer): Promise<ITestFluidObject> {
	const entryPoint: FluidObject<TestFluidObject> = await container.getEntryPoint();
	assert(entryPoint.ITestFluidObject !== undefined);
	return entryPoint.ITestFluidObject;
}

async function getTreeView(
	dataObject: ITestFluidObject,
): Promise<TreeView<typeof SerializationRoot>> {
	const handle = dataObject.root.get<IFluidHandle<ITree>>(treeKey);
	assert(handle !== undefined);
	const tree = await handle.get();
	return tree.viewWith(treeConfiguration);
}

async function waitForSaved(container: IContainer): Promise<void> {
	await waitContainerToCatchUp(container);
	if (container.isDirty) {
		await timeoutPromise((resolve) => container.once("saved", () => resolve()));
	}
}

async function serialize(
	container: IContainer,
	includeLocalChanges: boolean,
): Promise<string> {
	return asLegacyAlpha(container).serializeV2({ includeLocalChanges });
}

describe("container serializeV2", () => {
	let server: ILocalDeltaConnectionServer;
	let loaderProps: ILoaderProps;
	let codeDetails: IFluidCodeDetails;
	let urlResolver: LocalResolver;
	let source: IContainer;
	let sourceObject: ITestFluidObject;
	let url: string;
	let containers: IContainer[];

	beforeEach(async () => {
		containers = [];
		server = LocalDeltaConnectionServer.create();
		const factory = new TestFluidObjectFactory(
			[
				["map", SharedMap.getFactory()],
				["tree", SharedTree.getFactory()],
			],
			"default",
		);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory: factory,
			oldestSupportedClient: "2.40.0",
			registryEntries: [[factory.type, Promise.resolve(factory)]],
			runtimeOptions: {
				enableRuntimeIdCompressor: "on",
				explicitSchemaControl: true,
				createBlobPayloadPending: true,
			},
		});
		const loader = createLoader({ deltaConnectionServer: server, runtimeFactory });
		loaderProps = loader.loaderProps;
		codeDetails = loader.codeDetails;
		urlResolver = loader.urlResolver;
		source = await createDetachedContainer({
			...loaderProps,
			codeDetails: loader.codeDetails,
		});
		containers.push(source);
		sourceObject = await getDataObject(source);
		const tree = SharedTree.create(sourceObject.runtime, treeKey);
		const view = tree.viewWith(treeConfiguration);
		view.initialize({ first: "initial first", second: "initial second" });
		view.dispose();
		sourceObject.root.set(treeKey, tree.handle);
		sourceObject.root.set("value", "initial");
		await source.attach(loader.urlResolver.createCreateNewRequest("serialization"));
		await waitForSaved(source);

		// Exercise replay of sequenced ops after the attach snapshot, not just snapshot loading.
		sourceObject.root.set("value", "sequenced");
		const sequencedView = await getTreeView(sourceObject);
		sequencedView.root.first = "sequenced first";
		sequencedView.dispose();
		await waitForSaved(source);
		const absoluteUrl = await source.getAbsoluteUrl("");
		assert(absoluteUrl !== undefined);
		url = absoluteUrl;
	});

	afterEach(async () => {
		for (const container of containers) {
			container.dispose();
		}
		await server.close();
	});

	async function loadFrozen(state: string): Promise<IContainer> {
		const container = await loadFrozenContainerFromPendingState({
			...loaderProps,
			request: { url },
			pendingLocalState: state,
			readOnly: false,
		});
		containers.push(container);
		return container;
	}

	async function loadLive(state?: string): Promise<IContainer> {
		const container = await loadExistingContainer({
			...loaderProps,
			request: { url },
			pendingLocalState: state,
		});
		containers.push(container);
		await waitForSaved(container);
		return container;
	}

	for (const includeLocalChanges of [true, false]) {
		it(`captures the full detached draft for independent documents, includeLocalChanges: ${includeLocalChanges}`, async () => {
			const draft = await createDetachedContainer({ ...loaderProps, codeDetails });
			containers.push(draft);
			const draftObject = await getDataObject(draft);
			draftObject.root.set("value", "draft");
			const tree = SharedTree.create(draftObject.runtime, treeKey);
			const draftView = tree.viewWith(treeConfiguration);
			draftView.initialize({ first: "draft first", second: "draft second" });
			draftObject.root.set(treeKey, tree.handle);
			const state = await serialize(draft, includeLocalChanges);
			draftObject.root.set("value", "later draft");
			draftView.root.first = "later draft first";
			draftView.dispose();

			const first = await rehydrateDetachedContainer({
				...loaderProps,
				serializedState: state,
			});
			const second = await rehydrateDetachedContainer({
				...loaderProps,
				serializedState: state,
			});
			containers.push(first, second);
			const firstObject = await getDataObject(first);
			const secondObject = await getDataObject(second);
			const firstView = await getTreeView(firstObject);
			const secondView = await getTreeView(secondObject);
			assert.equal(firstObject.root.get("value"), "draft");
			assert.equal(secondObject.root.get("value"), "draft");
			assert.equal(firstView.root.first, "draft first");
			assert.equal(secondView.root.first, "draft first");
			firstView.root.first = "first document";
			secondView.root.second = "second document";
			await first.attach(urlResolver.createCreateNewRequest("first"));
			await second.attach(urlResolver.createCreateNewRequest("second"));
			await waitForSaved(first);
			await waitForSaved(second);
			assert.notEqual(await first.getAbsoluteUrl(""), await second.getAbsoluteUrl(""));
			assert.equal(firstView.root.second, "draft second");
			assert.equal(secondView.root.first, "draft first");
			assert.equal(draftObject.root.get("value"), "later draft");
			firstView.dispose();
			secondView.dispose();
		});

		it(`captures the requested state without changing the source, includeLocalChanges: ${includeLocalChanges}`, async () => {
			source.disconnect();
			sourceObject.root.set("value", "local");
			const view = await getTreeView(sourceObject);
			view.root.first = "local first";
			const state = await serialize(source, includeLocalChanges);
			const frozen = await loadFrozen(state);
			const frozenObject = await getDataObject(frozen);
			const frozenView = await getTreeView(frozenObject);
			assert.equal(
				frozenObject.root.get("value"),
				includeLocalChanges ? "local" : "sequenced",
			);
			assert.equal(
				frozenView.root.first,
				includeLocalChanges ? "local first" : "sequenced first",
			);
			assert.equal(sourceObject.root.get("value"), "local");
			assert.equal(view.root.first, "local first");
			assert.equal(source.isDirty, true);
			frozenView.dispose();
			view.dispose();
			// Omitting local state must not discard the source's pending operations.
			const retained = await loadFrozen(await getRequiredPendingLocalState(source));
			const retainedObject = await getDataObject(retained);
			assert.equal(retainedObject.root.get("value"), "local");
		});

		it(`includes the acknowledged edit when serialized inside a saved event handler, includeLocalChanges: ${includeLocalChanges}`, async () => {
			const state = await timeoutPromise<string>((resolve) => {
				source.once("saved", () => resolve(serialize(source, includeLocalChanges)));
				sourceObject.root.set("value", "saved callback edit");
			});
			const frozen = await loadFrozen(state);
			const frozenObject = await getDataObject(frozen);
			assert.equal(frozenObject.root.get("value"), "saved callback edit");
		});

		for (const action of ["close", "dispose"] as const) {
			it(`rejects after ${action}, includeLocalChanges: ${includeLocalChanges}`, async () => {
				source[action]();
				await assert.rejects(
					serialize(source, includeLocalChanges),
					/Container must be detached or attached, open, and not disposed/,
				);
			});
		}
	}

	it("loads reusable state into multiple live containers while the source remains open", async () => {
		const state = await serialize(source, false);
		const first = await loadLive(state);
		const second = await loadLive(state);
		assert.notEqual(first.clientId, source.clientId);
		assert.notEqual(second.clientId, first.clientId);
		const firstObject = await getDataObject(first);
		const secondObject = await getDataObject(second);
		assert.equal(firstObject.root.get("value"), "sequenced");
		assert.equal(secondObject.root.get("value"), "sequenced");
		assert.equal(source.closed, false);
	});

	it("excludes pending attachment blobs without losing the source's local state", async () => {
		const frozen = await loadFrozen(await serialize(source, false));
		const dataObject = await getDataObject(frozen);
		const blob = await dataObject.runtime.uploadBlob(stringToBuffer("pending blob", "utf8"));
		dataObject.root.set("blob", blob);
		const reusable = await serialize(frozen, false);
		const copy = await loadFrozen(reusable);
		const copyObject = await getDataObject(copy);
		assert.equal(copyObject.root.has("blob"), false);
		assert.equal(bufferToString(await blob.get(), "utf8"), "pending blob");

		const pending = await serialize(frozen, true);
		frozen.dispose();
		const replay = await loadLive(pending);
		const replayObject = await getDataObject(replay);
		const replayBlob = replayObject.root.get<IFluidHandle<ArrayBufferLike>>("blob");
		assert(replayBlob !== undefined);
		assert.equal(bufferToString(await replayBlob.get(), "utf8"), "pending blob");
	});

	it("preserves independent SharedTree edits replayed from the same reusable state", async () => {
		source.disconnect();
		const sourceView = await getTreeView(sourceObject);
		sourceView.root.first = "excluded local edit";
		sourceView.dispose();
		const baseline = await serialize(source, false);
		for (const [field, value] of [
			["first", "edited first"],
			["second", "edited second"],
		] as const) {
			const fork = await loadFrozen(baseline);
			const view = await getTreeView(await getDataObject(fork));
			view.root[field] = value;
			view.dispose();
			const edit = await serialize(fork, true);
			fork.dispose();
			const replay = await loadLive(edit);
			replay.dispose();
		}
		const final = await loadLive();
		const finalView = await getTreeView(await getDataObject(final));
		assert.equal(finalView.root.first, "edited first");
		assert.equal(finalView.root.second, "edited second");
		finalView.dispose();
	});
});
