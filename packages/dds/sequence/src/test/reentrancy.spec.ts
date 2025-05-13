/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	LocalReferenceCollection,
	MergeTreeDeltaType,
	ReferenceType,
	type ISegmentInternal,
} from "@fluidframework/merge-tree/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { resetReentrancyLogCounter } from "../sequence.js";
import { SharedString } from "../sequenceFactory.js";

describe("SharedString op-reentrancy", () => {
	/**
	 * This is an example scenario where reentrancy of submission of local ops was problematic which we saw in production.
	 *
	 * Reentrant local ops were a problem before #16815 as most SharedString local application methods were set up along
	 * the following lines:
	 * ```ts
	 * const op = this.client.insert(start, content);
	 * this.submitLocalMessage(op);
	 * ```
	 *
	 * However, `this.client.insert` triggers SharedString's delta event. Thus, if the application uses that event to submit
	 * further ops, from merge-tree's perspective they would have occurred *after* the first op, but the call to submit the op
	 * to the container runtime would happen *before* the call to submit the outermost op.
	 *
	 * Symptoms included various merge-tree asserts that the pending segments queue was inconsistent on the client which
	 * triggered a reentrant op (ex: 0x046) and doc corruption from the perspective of other clients.
	 *
	 * #16815 fixed this by moving op submission to before raising the `sequenceDelta` event.
	 */
	for (const sharedStringPreventReentrancy of [undefined, true]) {
		describe(`with preventSharedStringReentrancy: ${sharedStringPreventReentrancy}`, () => {
			it("throws on local re-entrancy", () => {
				const factory = SharedString.getFactory();
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
					attachState: AttachState.Detached,
				});
				dataStoreRuntime1.options = { sharedStringPreventReentrancy };

				const sharedString = factory.create(dataStoreRuntime1, "A");
				sharedString.insertText(0, "abcX");

				sharedString.on("sequenceDelta", ({ deltaOperation, isLocal }, target) => {
					if (deltaOperation === MergeTreeDeltaType.INSERT && isLocal) {
						target.removeRange(3, 4);
					}
				});

				assert.throws(() => sharedString.insertText(4, "e"), "Reentrancy detected");
			});
		});
	}

	describe("with sharedStringPreventReentrancy: false", () => {
		let sharedString: SharedString;
		let sharedString2: SharedString;
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let logger: MockLogger;
		beforeEach(() => {
			resetReentrancyLogCounter();
			containerRuntimeFactory = new MockContainerRuntimeFactory();

			const factory = SharedString.getFactory();
			logger = new MockLogger();
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
				logger: logger.toTelemetryLogger(),
			});
			dataStoreRuntime1.setAttachState(AttachState.Attached);
			dataStoreRuntime1.options = { sharedStringPreventReentrancy: false };
			sharedString = factory.create(dataStoreRuntime1, "A");

			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.connect(services1);

			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			dataStoreRuntime2.options = { sharedStringPreventReentrancy: false };
			dataStoreRuntime2.setAttachState(AttachState.Attached);
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			sharedString2 = factory.create(dataStoreRuntime2, "B");
			sharedString2.connect(services2);
		});

		it("remains consistent on reentrancy", () => {
			sharedString.insertText(0, "abcX");
			containerRuntimeFactory.processAllMessages();

			sharedString.on("sequenceDelta", ({ deltaOperation, isLocal }, target) => {
				if (deltaOperation === MergeTreeDeltaType.INSERT && isLocal) {
					target.removeRange(3, 4);
				}
			});

			sharedString.insertText(4, "e");
			containerRuntimeFactory.processAllMessages();

			for (const str of [sharedString, sharedString2]) {
				assert.equal(str.getText(), "abce");
			}
		});

		it("is empty after deleting reference pos in reentrant callback", () => {
			sharedString.insertText(0, "abcX");
			const { segment } = sharedString.getContainingSegment(0);
			assert(segment);
			const localRefs = LocalReferenceCollection.setOrGet(segment);
			const localRef = localRefs.createLocalRef(0, ReferenceType.SlideOnRemove, undefined);

			assert.notEqual(localRef.getSegment(), undefined);

			containerRuntimeFactory.processAllMessages();

			sharedString.on("sequenceDelta", ({ deltaOperation, isLocal }, target) => {
				if (deltaOperation === MergeTreeDeltaType.INSERT && isLocal) {
					const { segment: segment2 }: { segment: ISegmentInternal | undefined } =
						target.getContainingSegment(0);
					assert(segment2);
					assert.equal(segment, segment2);
					assert(segment2.localRefs);
					segment2.localRefs.removeLocalRef(localRef);
				}
			});

			sharedString.insertText(4, "e");
			containerRuntimeFactory.processAllMessages();

			sharedString.walkSegments((seg: ISegmentInternal) => {
				if (!seg.localRefs) {
					return false;
				}
				assert.equal(seg.localRefs.empty, true);
				assert.equal(seg.localRefs.has(localRef), false);
				return false;
			});

			assert.equal(localRef.getSegment(), undefined);
			assert.equal(localRef.getOffset(), 0);
		});

		it("is empty after deleting segment containing simple reference pos in reentrant callback", () => {
			sharedString.insertText(0, "abcX");
			const { segment } = sharedString.getContainingSegment(0);
			assert(segment);
			const localRefs = LocalReferenceCollection.setOrGet(segment);
			const localRef = localRefs.createLocalRef(0, ReferenceType.Simple, undefined);

			assert.notEqual(localRef.getSegment(), undefined);

			containerRuntimeFactory.processAllMessages();

			sharedString.on("sequenceDelta", ({ deltaOperation, isLocal }, target) => {
				if (deltaOperation === MergeTreeDeltaType.INSERT && isLocal) {
					target.removeRange(0, 4);
				}
			});

			sharedString.insertText(4, "e");
			containerRuntimeFactory.processAllMessages();

			sharedString.walkSegments((seg: ISegmentInternal) => {
				if (!seg.localRefs) {
					return false;
				}
				assert.equal(seg.localRefs.empty, true);
				assert.equal(seg.localRefs.has(localRef), false);
				return false;
			});

			assert.equal(localRef.getSegment(), undefined);
			assert.equal(localRef.getOffset(), 0);
		});

		it("logs reentrant events a fixed number of times", () => {
			let numberRemainingReentrantInserts = 10;
			sharedString.on("sequenceDelta", ({ isLocal }, target) => {
				if (isLocal && numberRemainingReentrantInserts > 0) {
					numberRemainingReentrantInserts--;
					target.insertText(target.getLength(), "1");
				}
			});

			sharedString.insertText(0, "A");

			containerRuntimeFactory.processAllMessages();
			const eventName = "fluid:MockFluidDataStoreRuntime:LocalOpReentry";
			logger.assertMatchStrict([
				{ eventName, depth: 1 },
				{ eventName, depth: 2 },
				{ eventName, depth: 3 },
			]);
			logger.assertMatchNone([{ eventName, depth: 4 }]);
		});
	});
});
