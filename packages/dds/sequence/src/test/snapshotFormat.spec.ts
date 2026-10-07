/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { ISummaryTree } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { configuredSharedString, SharedString, SharedStringFactory } from "../sequenceFactory.js";
import type { ISharedString } from "../sharedString.js";

import { assertSnapshotFormat } from "./snapshotFormatUtils.js";

const snapshotFormatConfig = "Fluid.Sequence.newMergeTreeSnapshotFormat";

interface SnapshotFormatFlags {
	configuration?: boolean;
	factory?: boolean;
	runtime?: boolean;
}

for (const attachState of [AttachState.Detached, AttachState.Attached]) {
	describe(`SharedString snapshot format (${attachState})`, () => {
		const factory = new SharedStringFactory();
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
		});

		function getFactory(flags: SnapshotFormatFlags) {
			return configuredSharedString(
				flags.factory === undefined ? {} : { newMergeTreeSnapshotFormat: flags.factory },
			).getFactory();
		}

		function createRuntime(flags: SnapshotFormatFlags): MockFluidDataStoreRuntime {
			const logger = mixinMonitoringContext(createChildLogger({}), {
				getRawConfig: (name) =>
					name === snapshotFormatConfig ? flags.configuration : undefined,
			}).logger;
			const runtime = new MockFluidDataStoreRuntime({
				attachState,
				logger,
				registry: [getFactory(flags)],
			});
			runtime.options = {
				newMergeTreeSnapshotFormat: flags.runtime,
				mergeTreeSnapshotChunkSize: 5,
			};
			if (attachState === AttachState.Attached) {
				containerRuntimeFactory.createContainerRuntime(runtime);
				runtime.deltaManagerInternal.lastSequenceNumber =
					containerRuntimeFactory.sequenceNumber;
				runtime.deltaManagerInternal.minimumSequenceNumber =
					containerRuntimeFactory.getMinSeq();
			}
			return runtime;
		}

		function createString(
			flags: SnapshotFormatFlags,
			runtime = createRuntime(flags),
			selectedFactory = getFactory(flags),
		): ISharedString {
			const sharedString = selectedFactory.create(runtime, "shared-string");
			sharedString.insertText(0, "before");
			if (attachState === AttachState.Attached) {
				sharedString.connect({
					deltaConnection: runtime.createDeltaConnection(),
					objectStorage: new MockStorage(),
				});
			}
			assert.equal(sharedString.isAttached(), attachState === AttachState.Attached);
			return sharedString;
		}

		async function loadString(
			summary: ISummaryTree,
			flags: SnapshotFormatFlags,
		): Promise<ISharedString> {
			const runtime = createRuntime(flags);
			const selectedFactory = getFactory(flags);
			const sharedString = await selectedFactory.load(
				runtime,
				"shared-string",
				{
					deltaConnection: runtime.createDeltaConnection(),
					objectStorage: MockStorage.createFromSummary(summary),
				},
				selectedFactory.attributes,
			);
			assert.equal(sharedString.isAttached(), attachState === AttachState.Attached);
			return sharedString;
		}

		for (const configuration of [undefined, false, true]) {
			for (const factorySetting of [undefined, false, true]) {
				for (const runtime of [undefined, false, true]) {
					for (const loadedFormat of [undefined, false, true]) {
						it(`uses configuration=${configuration}, factory=${factorySetting}, runtime=${runtime}, loadedFormat=${loadedFormat}`, async () => {
							const flags = { configuration, factory: factorySetting, runtime };
							let sharedString: ISharedString;
							if (loadedFormat === undefined) {
								sharedString = createString(flags);
							} else {
								const source = createString({ factory: loadedFormat });
								sharedString = await loadString(source.getAttachSummary().summary, flags);
							}
							sharedString.insertText(sharedString.getLength(), " after");
							containerRuntimeFactory.processAllMessages();
							const expectedFormat =
								configuration ?? factorySetting ?? runtime ?? loadedFormat ?? false;

							assertSnapshotFormat(
								sharedString,
								sharedString.getAttachSummary().summary,
								expectedFormat,
							);
							const summary = await sharedString.summarize();
							assertSnapshotFormat(sharedString, summary.summary, expectedFormat);
							const loaded = await loadString(summary.summary, {});
							assert.equal(loaded.getText(), "before after");
							const loadedSummary = await loaded.summarize();
							assertSnapshotFormat(loaded, loadedSummary.summary, expectedFormat);
						});
					}
				}
			}
		}

		it("creates the configured kind through a registered factory with the same DDS identity", async () => {
			const kind = configuredSharedString({ newMergeTreeSnapshotFormat: true });
			const runtime = createRuntime({ factory: true, runtime: false });
			const sharedString = kind.create(runtime, "configured");
			if (attachState === AttachState.Attached) {
				sharedString.connect({
					deltaConnection: runtime.createDeltaConnection(),
					objectStorage: new MockStorage(),
				});
			}
			assert(kind.is(sharedString));
			assert(SharedString.is(sharedString));
			assert.equal(kind.getFactory().type, SharedStringFactory.Type);
			assert.deepEqual(kind.getFactory().attributes, SharedStringFactory.Attributes);
			const summary = await sharedString.summarize();
			assertSnapshotFormat(sharedString, summary.summary, true);
			assert.equal(runtime.options.newMergeTreeSnapshotFormat, false);
		});

		it("captures factory options without sharing mutable input or other kinds' configuration", async () => {
			const options = { newMergeTreeSnapshotFormat: true };
			const kind = configuredSharedString(options);
			options.newMergeTreeSnapshotFormat = false;
			const runtime = createRuntime({ runtime: false });
			const sharedString = createString({ runtime: false }, runtime, kind.getFactory());
			const summary = await sharedString.summarize();
			assertSnapshotFormat(sharedString, summary.summary, true);

			const legacyString = createString({ factory: false, runtime: true });
			const legacySummary = await legacyString.summarize();
			assertSnapshotFormat(legacyString, legacySummary.summary, false);
			const nextSummary = await sharedString.summarize();
			assertSnapshotFormat(sharedString, nextSummary.summary, true);
		});

		for (const useFlatFormat of [false, true]) {
			it(`retains ${useFlatFormat ? "flat" : "legacy"} selection after reload and edits without an explicit flag`, async () => {
				const sharedString = createString({ runtime: useFlatFormat });
				const summary = await sharedString.summarize();
				assertSnapshotFormat(sharedString, summary.summary, useFlatFormat);
				const loaded = await loadString(summary.summary, {});
				loaded.insertText(loaded.getLength(), " after");
				containerRuntimeFactory.processAllMessages();

				const nextSummary = await loaded.summarize();
				assertSnapshotFormat(loaded, nextSummary.summary, useFlatFormat);
				const reloaded = await loadString(nextSummary.summary, {});
				assert.equal(reloaded.getText(), "before after");
				assertSnapshotFormat(reloaded, reloaded.getAttachSummary().summary, useFlatFormat);
			});

			it(`uses an explicit ${useFlatFormat ? "legacy" : "flat"} override for subsequent loads`, async () => {
				const sharedString = createString({ runtime: useFlatFormat });
				const summary = sharedString.getAttachSummary();
				const loaded = await loadString(summary.summary, {
					runtime: !useFlatFormat,
				});
				loaded.insertText(loaded.getLength(), " override");
				containerRuntimeFactory.processAllMessages();

				const nextSummary = await loaded.summarize();
				assertSnapshotFormat(loaded, nextSummary.summary, !useFlatFormat);
				assertSnapshotFormat(sharedString, summary.summary, useFlatFormat);
				const reloaded = await loadString(nextSummary.summary, {});
				assert.equal(reloaded.getText(), "before override");
				const reloadedSummary = await reloaded.summarize();
				assertSnapshotFormat(reloaded, reloadedSummary.summary, !useFlatFormat);
			});
		}

		it("remembers each successfully written format when runtime overrides are removed", async () => {
			const runtime = createRuntime({ runtime: true });
			const sharedString = createString({ runtime: true }, runtime);
			assertSnapshotFormat(sharedString, sharedString.getAttachSummary().summary, true);

			runtime.options.newMergeTreeSnapshotFormat = undefined;
			const inheritedFlat = await sharedString.summarize();
			assertSnapshotFormat(sharedString, inheritedFlat.summary, true);

			runtime.options.newMergeTreeSnapshotFormat = false;
			const explicitLegacy = await sharedString.summarize();
			assertSnapshotFormat(sharedString, explicitLegacy.summary, false);

			runtime.options.newMergeTreeSnapshotFormat = undefined;
			const inheritedLegacy = await sharedString.summarize();
			assertSnapshotFormat(sharedString, inheritedLegacy.summary, false);
		});

		it("keeps format memory per instance without changing DDS attributes", async () => {
			const originalAttributes = { ...factory.attributes };
			const source = createString({ runtime: true });
			const sourceSummary = await source.summarize();
			const flatString = await loadString(sourceSummary.summary, {});
			const inheritedFlat = await flatString.summarize();
			assertSnapshotFormat(flatString, inheritedFlat.summary, true);
			assert.deepEqual(factory.attributes, originalAttributes);

			const legacyString = createString({});
			const legacySummary = await legacyString.summarize();
			assertSnapshotFormat(legacyString, legacySummary.summary, false);
			const nextFlat = await flatString.summarize();
			assertSnapshotFormat(flatString, nextFlat.summary, true);
			assert.deepEqual(flatString.attributes, originalAttributes);
			assert.deepEqual(legacyString.attributes, originalAttributes);
			assert.deepEqual(factory.attributes, originalAttributes);
		});
	});
}

describe("SharedString snapshot format on attach", () => {
	it("retains the detached summary selection after the explicit flag is removed and the DDS attaches", async () => {
		const runtime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		runtime.options = { newMergeTreeSnapshotFormat: true };
		const sharedString = new SharedStringFactory().create(runtime, "shared-string");
		sharedString.insertText(0, "before");
		assertSnapshotFormat(sharedString, sharedString.getAttachSummary().summary, true);

		runtime.options.newMergeTreeSnapshotFormat = undefined;
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		containerRuntimeFactory.createContainerRuntime(runtime);
		sharedString.connect({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		runtime.setAttachState(AttachState.Attached);
		assert.equal(sharedString.isAttached(), true);
		sharedString.insertText(sharedString.getLength(), " after");
		containerRuntimeFactory.processAllMessages();

		assert.equal(sharedString.getText(), "before after");
		const summary = await sharedString.summarize();
		assertSnapshotFormat(sharedString, summary.summary, true);
	});
});
