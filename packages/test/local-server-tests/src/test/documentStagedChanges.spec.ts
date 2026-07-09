/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	createAndAttachContainerUsingProps,
	ITestFluidObject,
	LoaderContainerTracker,
	LocalCodeLoader,
	TestFluidObjectFactory,
} from "@fluidframework/test-utils/internal";

// enterStagingMode/commitChanges/discardChanges/hasStagedChanges are exposed on the (legacy, beta)
// IContainerRuntimeBase, which is what a data store context's `containerRuntime` is typed as.
type IContainerRuntime_WithHasStagedChanges = IContainerRuntime & IContainerRuntimeBase;

describe("Document Staged Changes", () => {
	const documentId = "documentStagedChangesTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const mapId = "mapKey";
	const codeDetails: IFluidCodeDetails = {
		package: "documentStagedChangesTestPackage",
		config: {},
	};

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let documentServiceFactory: LocalDocumentServiceFactory;
	let urlResolver: LocalResolver;
	let loaderContainerTracker: LoaderContainerTracker;
	let container: IContainer;
	let dataObject: ITestFluidObject;
	let containerRuntime: IContainerRuntime_WithHasStagedChanges;
	let sharedMap: ISharedMap;
	let wasMarkedStagedRuntimeCount: number;
	let wasMarkedUnstagedRuntimeCount: number;

	/**
	 * Increments the appropriate count when the "hasStagedChangesChanged" event is fired
	 */
	function registerHasStagedChangesChangedHandlers(): void {
		containerRuntime.on("hasStagedChangesChanged", (hasStagedChanges) => {
			if (hasStagedChanges) {
				wasMarkedStagedRuntimeCount += 1;
			} else {
				wasMarkedUnstagedRuntimeCount += 1;
			}
			assert.equal(
				containerRuntime.hasStagedChanges,
				hasStagedChanges,
				"hasStagedChanges should match the event payload when the handler runs",
			);
		});
	}

	function checkStagedChangesState(
		when: string,
		expectedHasStagedChanges: boolean,
		expectedStagedCount: number,
		expectedUnstagedCount: number,
	): void {
		assert.equal(
			containerRuntime.hasStagedChanges,
			expectedHasStagedChanges,
			`Runtime hasStagedChanges not expected ${when}`,
		);
		assert.equal(
			wasMarkedStagedRuntimeCount,
			expectedStagedCount,
			`Runtime "staged" transition count not expected ${when}`,
		);
		assert.equal(
			wasMarkedUnstagedRuntimeCount,
			expectedUnstagedCount,
			`Runtime "unstaged" transition count not expected ${when}`,
		);
	}

	async function createContainer(): Promise<IContainer> {
		const defaultFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
			[[mapId, SharedMap.getFactory()]],
			"default",
		);

		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			// Use a low threshold so staged ops are auto-flushed out of the Outbox right away instead of
			// waiting for the default (1000 ops) batch size.
			runtimeOptions: { stagingModeAutoFlushThreshold: 1 },
		});

		const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

		const createDetachedContainerProps: ILoaderProps = {
			urlResolver,
			documentServiceFactory,
			codeLoader,
		};

		const containerUsingProps = await createAndAttachContainerUsingProps(
			{ ...createDetachedContainerProps, codeDetails },
			urlResolver.createCreateNewRequest(documentId),
		);
		loaderContainerTracker.addContainer(containerUsingProps);
		return containerUsingProps;
	}

	async function loadContainer(): Promise<IContainer> {
		const defaultFactory: TestFluidObjectFactory = new TestFluidObjectFactory(
			[[mapId, SharedMap.getFactory()]],
			"default",
		);

		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
			defaultFactory,
			registryEntries: [[defaultFactory.type, Promise.resolve(defaultFactory)]],
			runtimeOptions: { stagingModeAutoFlushThreshold: 1 },
		});

		const codeLoader = new LocalCodeLoader([[codeDetails, runtimeFactory]]);

		const loadedContainer = await loadExistingContainer({
			urlResolver,
			documentServiceFactory,
			codeLoader,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(loadedContainer);
		return loadedContainer;
	}

	beforeEach(async () => {
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
		urlResolver = new LocalResolver();
		loaderContainerTracker = new LoaderContainerTracker();

		// Create the first container, component and DDSes.
		container = await createContainer();
		dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		containerRuntime = dataObject.context
			.containerRuntime as unknown as IContainerRuntime_WithHasStagedChanges;
		sharedMap = await dataObject.getSharedObject<ISharedMap>(mapId);

		// Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
		// re-sent. Do it here so that the extra events don't mess with rest of the test.
		sharedMap.set("setup", "done");

		await loaderContainerTracker.ensureSynchronized();

		wasMarkedStagedRuntimeCount = 0;
		wasMarkedUnstagedRuntimeCount = 0;

		registerHasStagedChangesChangedHandlers();
	});

	afterEach(async () => {
		loaderContainerTracker.reset();
		await deltaConnectionServer.webSocketServer.close();
	});

	it("remains false before entering staging mode and while ordinary ops are sent", async () => {
		checkStagedChangesState("before value set", false, 0, 0);

		// Ordinary (non-staged) edits should never affect hasStagedChanges.
		sharedMap.set("key", "value");

		checkStagedChangesState("after value set", false, 0, 0);

		await loaderContainerTracker.ensureSynchronized();

		checkStagedChangesState("after processing value set", false, 0, 0);
	});

	it("marks state as having staged changes when ops are sent in staging mode, and clears on commitChanges", async () => {
		checkStagedChangesState("before staging mode", false, 0, 0);

		const stageControls = containerRuntime.enterStagingMode();

		checkStagedChangesState("immediately after entering staging mode", false, 0, 0);

		sharedMap.set("key", "value");

		await Promise.resolve(); // Let the scheduled flush (turn-based) run

		checkStagedChangesState("after value set in staging mode", true, 1, 0);

		stageControls.commitChanges();

		checkStagedChangesState("after commitChanges", false, 1, 1);

		// Committing sends the previously staged ops to the ordering service.
		await loaderContainerTracker.ensureSynchronized();

		checkStagedChangesState("after processing committed changes", false, 1, 1);
	});

	it("marks state as having staged changes when ops are sent in staging mode, and clears on discardChanges", async () => {
		checkStagedChangesState("before staging mode", false, 0, 0);

		const stageControls = containerRuntime.enterStagingMode();

		sharedMap.set("key", "value");

		await Promise.resolve(); // Let the scheduled flush (turn-based) run

		checkStagedChangesState("after value set in staging mode", true, 1, 0);

		stageControls.discardChanges();

		checkStagedChangesState("after discardChanges", false, 1, 1);

		await loaderContainerTracker.ensureSynchronized();

		checkStagedChangesState("after processing (nothing to process)", false, 1, 1);
	});

	it("marks state as having staged changes for batch ops sent in staging mode", async () => {
		const stageControls = containerRuntime.enterStagingMode();

		dataObject.context.containerRuntime.orderSequentially(() => {
			sharedMap.set("key1", "value1");
			sharedMap.set("key2", "value2");
		});

		await Promise.resolve(); // Let the scheduled flush (turn-based) run

		checkStagedChangesState("after batch value set in staging mode", true, 1, 0);

		stageControls.commitChanges();

		checkStagedChangesState("after commitChanges", false, 1, 1);

		await loaderContainerTracker.ensureSynchronized();

		checkStagedChangesState("after processing committed changes", false, 1, 1);
	});

	it("does not emit again for a second staged op in the same staging session", async () => {
		const stageControls = containerRuntime.enterStagingMode();

		sharedMap.set("key1", "value1");
		await Promise.resolve(); // Let the scheduled flush (turn-based) run
		checkStagedChangesState("after first value set", true, 1, 0);

		sharedMap.set("key2", "value2");
		await Promise.resolve(); // Let the scheduled flush (turn-based) run
		checkStagedChangesState("after second value set", true, 1, 0);

		stageControls.discardChanges();
		checkStagedChangesState("after discardChanges", false, 1, 1);
	});

	it("is independent from the ordinary isDirty/dirty flag and event", async () => {
		// Make an ordinary (non-staged) edit, so isDirty is true but hasStagedChanges is false.
		sharedMap.set("key", "value");
		assert.equal(containerRuntime.isDirty, true, "Should be dirty due to ordinary edit");
		checkStagedChangesState("after ordinary edit", false, 0, 0);

		const stageControls = containerRuntime.enterStagingMode();

		sharedMap.set("staged-key", "staged-value");
		await Promise.resolve(); // Let the scheduled flush (turn-based) run
		assert.equal(
			containerRuntime.isDirty,
			true,
			"Should still be dirty due to staged edit as well",
		);
		checkStagedChangesState("after staged edit", true, 1, 0);

		stageControls.discardChanges();

		// The ordinary edit from before staging mode is still pending, so isDirty remains true,
		// even though hasStagedChanges is now false.
		assert.equal(
			containerRuntime.isDirty,
			true,
			"Should still be dirty due to the original ordinary edit",
		);
		checkStagedChangesState("after discardChanges", false, 1, 1);

		await loaderContainerTracker.ensureSynchronized();

		assert.equal(containerRuntime.isDirty, false, "Should be clean after processing");
		checkStagedChangesState("after processing", false, 1, 1);
	});

	it("is independent from isDirty/dirty on the commit path: isDirty stays true (in-flight ops) while hasStagedChanges flips false", async () => {
		checkStagedChangesState("before staging mode", false, 0, 0);
		assert.equal(containerRuntime.isDirty, false, "Should not be dirty before staging mode");

		const stageControls = containerRuntime.enterStagingMode();

		sharedMap.set("staged-key", "staged-value");
		await Promise.resolve(); // Let the scheduled flush (turn-based) run
		checkStagedChangesState("after staged edit", true, 1, 0);
		assert.equal(containerRuntime.isDirty, true, "Should be dirty due to staged edit");

		stageControls.commitChanges();

		// Committing moves the previously-staged ops out of Staging Mode and resubmits them as ordinary
		// (now in-flight, unacked) ops. So immediately after commitChanges, hasStagedChanges is false, but
		// isDirty remains true since those ops haven't been acked by the server yet.
		checkStagedChangesState("immediately after commitChanges", false, 1, 1);
		assert.equal(
			containerRuntime.isDirty,
			true,
			"Should still be dirty right after commitChanges, since committed ops are now in-flight/unacked",
		);

		await loaderContainerTracker.ensureSynchronized();

		assert.equal(
			containerRuntime.isDirty,
			false,
			"Should be clean once the committed ops are acked",
		);
		checkStagedChangesState("after processing committed changes", false, 1, 1);
	});

	it("hasStagedChanges is false on a freshly-loaded container (staged state is never persisted)", async () => {
		// Enter staging mode and leave changes staged (never discard/commit) before loading a second container.
		const stageControls = containerRuntime.enterStagingMode();
		sharedMap.set("staged-key", "staged-value");
		await Promise.resolve(); // Let the scheduled flush (turn-based) run
		checkStagedChangesState("after staged edit, before loading second container", true, 1, 0);

		// Load a second container from the same document. Staged state is local-only and never
		// persisted to the summary/snapshot, so the freshly-loaded container should have no
		// staged changes at all, regardless of what was left staged (and un-committed) on the
		// container that produced the snapshot it loaded from.
		const secondContainer = await loadContainer();
		const secondDataObject = (await secondContainer.getEntryPoint()) as ITestFluidObject;
		const secondContainerRuntime = secondDataObject.context
			.containerRuntime as unknown as IContainerRuntime_WithHasStagedChanges;

		assert.equal(
			secondContainerRuntime.hasStagedChanges,
			false,
			"A freshly-loaded container should never report staged changes",
		);

		// Cleanup: discard the staged changes on the original container/runtime so it doesn't
		// interfere with other tests via loaderContainerTracker.
		stageControls.discardChanges();
	});
});
