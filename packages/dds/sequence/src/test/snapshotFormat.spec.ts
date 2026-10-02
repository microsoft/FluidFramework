/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

const snapshotFormatConfig = "Fluid.Sequence.newMergeTreeSnapshotFormat";

interface SnapshotFormatFlags {
	configuration?: boolean;
	runtime?: boolean;
	recorded?: boolean;
}

function assertSnapshotFormat(
	sharedString: SharedStringClass,
	summary: ISummaryTree,
	useFlatFormat: boolean,
): void {
	const content = summary.tree.content;
	assert(content.type === SummaryType.Tree);
	const header = content.tree.header;
	assert(header.type === SummaryType.Blob);
	assert(typeof header.content === "string");
	const chunk: unknown = JSON.parse(header.content);
	assert(typeof chunk === "object" && chunk !== null);
	assert.equal(
		"version" in chunk ? chunk.version : undefined,
		useFlatFormat ? "1" : undefined,
	);
	assert.equal("segments" in chunk, useFlatFormat);
	assert.equal("segmentTexts" in chunk, !useFlatFormat);
	if (useFlatFormat) {
		assert.equal(content.tree.catchupOps, undefined);
	}
	assert("newMergeTreeSnapshotFormat" in sharedString.attributes);
	assert.equal(sharedString.attributes.newMergeTreeSnapshotFormat, useFlatFormat);
	assert.equal(
		sharedString.attributes.snapshotFormatVersion,
		SharedStringFactory.Attributes.snapshotFormatVersion,
	);
}

for (const attachState of [AttachState.Detached, AttachState.Attached]) {
	describe(`SharedString snapshot format (${attachState})`, () => {
		const factory = new SharedStringFactory();
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
		});

		function createRuntime(flags: SnapshotFormatFlags): MockFluidDataStoreRuntime {
			const logger = mixinMonitoringContext(createChildLogger({}), {
				getRawConfig: (name) =>
					name === snapshotFormatConfig ? flags.configuration : undefined,
			}).logger;
			const runtime = new MockFluidDataStoreRuntime({ attachState, logger });
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

		function createString(flags: SnapshotFormatFlags): SharedStringClass {
			const runtime = createRuntime(flags);
			const attributes =
				flags.recorded === undefined
					? factory.attributes
					: { ...factory.attributes, newMergeTreeSnapshotFormat: flags.recorded };
			const sharedString = new SharedStringClass(runtime, "shared-string", attributes);
			sharedString.initializeLocal();
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
			attributes: IChannelAttributes,
			flags: SnapshotFormatFlags,
		): Promise<SharedStringClass> {
			const runtime = createRuntime(flags);
			const sharedString = await factory.load(
				runtime,
				"shared-string",
				{
					deltaConnection: runtime.createDeltaConnection(),
					objectStorage: MockStorage.createFromSummary(summary),
				},
				attributes,
			);
			assert.equal(sharedString.isAttached(), attachState === AttachState.Attached);
			return sharedString;
		}

		for (const configuration of [undefined, false, true]) {
			for (const runtime of [undefined, false, true]) {
				for (const recorded of [undefined, false, true]) {
					it(`uses configuration=${configuration}, runtime=${runtime}, recorded=${recorded}`, async () => {
						const sharedString = createString({ configuration, runtime, recorded });
						sharedString.insertText(sharedString.getLength(), " after");
						containerRuntimeFactory.processAllMessages();
						const expectedFormat = configuration ?? runtime ?? recorded ?? false;

						assertSnapshotFormat(
							sharedString,
							sharedString.getAttachSummary().summary,
							expectedFormat,
						);
						const summary = await sharedString.summarize();
						assertSnapshotFormat(sharedString, summary.summary, expectedFormat);
						const loaded = await loadString(summary.summary, sharedString.attributes, {});
						assert.equal(loaded.getText(), "before after");
						const loadedSummary = await loaded.summarize();
						assertSnapshotFormat(loaded, loadedSummary.summary, expectedFormat);
					});
				}
			}
		}

		for (const useFlatFormat of [false, true]) {
			it(`retains ${useFlatFormat ? "flat" : "legacy"} selection after reload and edits without an explicit flag`, async () => {
				const sharedString = createString({ runtime: useFlatFormat });
				const summary = await sharedString.summarize();
				assertSnapshotFormat(sharedString, summary.summary, useFlatFormat);
				const loaded = await loadString(summary.summary, sharedString.attributes, {});
				loaded.insertText(loaded.getLength(), " after");
				containerRuntimeFactory.processAllMessages();

				const nextSummary = await loaded.summarize();
				assertSnapshotFormat(loaded, nextSummary.summary, useFlatFormat);
				const reloaded = await loadString(nextSummary.summary, loaded.attributes, {});
				assert.equal(reloaded.getText(), "before after");
				assertSnapshotFormat(reloaded, reloaded.getAttachSummary().summary, useFlatFormat);
			});

			it(`records an explicit ${useFlatFormat ? "legacy" : "flat"} override for subsequent loads`, async () => {
				const sharedString = createString({ runtime: useFlatFormat });
				const summary = sharedString.getAttachSummary();
				const loaded = await loadString(summary.summary, sharedString.attributes, {
					runtime: !useFlatFormat,
				});
				loaded.insertText(loaded.getLength(), " override");
				containerRuntimeFactory.processAllMessages();

				const nextSummary = await loaded.summarize();
				assertSnapshotFormat(loaded, nextSummary.summary, !useFlatFormat);
				assertSnapshotFormat(sharedString, summary.summary, useFlatFormat);
				const reloaded = await loadString(nextSummary.summary, loaded.attributes, {});
				assert.equal(reloaded.getText(), "before override");
				const reloadedSummary = await reloaded.summarize();
				assertSnapshotFormat(reloaded, reloadedSummary.summary, !useFlatFormat);
			});
		}

		it("does not share recorded flags between instances or mutate factory attributes", async () => {
			const originalAttributes = { ...factory.attributes };
			const flatString = createString({ runtime: true });
			const flatSummary = await flatString.summarize();
			assertSnapshotFormat(flatString, flatSummary.summary, true);
			assert.deepEqual(factory.attributes, originalAttributes);

			const legacyString = createString({});
			const legacySummary = await legacyString.summarize();
			assertSnapshotFormat(legacyString, legacySummary.summary, false);
			assert.notEqual(flatString.attributes, legacyString.attributes);
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
