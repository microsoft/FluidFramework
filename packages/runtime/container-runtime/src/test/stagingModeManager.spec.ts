/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import Sinon from "sinon";
import { StagingModeManager, type StagingModeDependencies } from "../stagingModeManager.js";
import type { LocalContainerRuntimeMessage } from "../messageTypes.js";

describe("StagingModeManager", () => {
	let sandbox: Sinon.SinonSandbox;
	let dependencies: StagingModeDependencies;
	let mockMainBatchMessageCount: { value: number };
	let mockLastStagedMessage: { value: object | undefined };

	beforeEach(() => {
		sandbox = Sinon.createSandbox();

		// Use objects to allow mutation of readonly properties in tests
		mockMainBatchMessageCount = { value: 0 };
		mockLastStagedMessage = { value: undefined };

		// Create minimal mocks for each dependency using Pick types
		dependencies = {
			pendingStateManager: {
				popStagedBatches: sandbox.stub(),
				replayPendingStates: sandbox.stub(),
				getLastPendingMessage: sandbox.stub().callsFake(() => mockLastStagedMessage.value),
			} as unknown as StagingModeDependencies["pendingStateManager"],
			outbox: {
				flush: sandbox.stub(),
				get mainBatchMessageCount() {
					return mockMainBatchMessageCount.value;
				},
			} as unknown as StagingModeDependencies["outbox"],
			channelCollection: {
				notifyStagingMode: sandbox.stub(),
			} as unknown as StagingModeDependencies["channelCollection"],
			submitIdAllocationOpIfNeeded: sandbox.stub(),
			rollbackStagedChange: sandbox.stub(),
			updateDocumentDirtyState: sandbox.stub(),
			closeFn: sandbox.stub(),
		};
	});

	afterEach(() => {
		sandbox.restore();
	});

	describe("inStagingMode", () => {
		it("should return false initially", () => {
			const manager = new StagingModeManager(dependencies);
			assert.equal(manager.inStagingMode, false);
		});

		it("should return true after entering staging mode", () => {
			const manager = new StagingModeManager(dependencies);
			manager.enterStagingMode(() => {});
			assert.equal(manager.inStagingMode, true);
		});

		it("should return false after exiting staging mode", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.discardChanges();
			assert.equal(manager.inStagingMode, false);
		});
	});

	describe("enterStagingMode", () => {
		it("should throw if already in staging mode", () => {
			const manager = new StagingModeManager(dependencies);
			manager.enterStagingMode(() => {});
			assert.throws(() => manager.enterStagingMode(() => {}), /Already in staging mode/);
		});

		it("should call flush function", () => {
			const flushFn = sandbox.stub();
			const manager = new StagingModeManager(dependencies);
			manager.enterStagingMode(flushFn);
			assert(flushFn.calledOnce, "Flush function should be called once");
		});

		it("should call notifyStagingMode(true)", () => {
			const manager = new StagingModeManager(dependencies);
			manager.enterStagingMode(() => {});
			assert(
				(
					dependencies.channelCollection.notifyStagingMode as Sinon.SinonStub
				).calledOnceWithExactly(true),
				"notifyStagingMode should be called with true",
			);
		});

		it("should return stage controls", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			assert.notEqual(controls.discardChanges, undefined, "Should have discardChanges");
			assert.notEqual(controls.commitChanges, undefined, "Should have commitChanges");
			assert.notEqual(controls.checkpoint, undefined, "Should have checkpoint");
		});
	});

	describe("discardChanges", () => {
		it("should flush outbox", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.discardChanges();
			assert(
				(dependencies.outbox.flush as Sinon.SinonStub).called,
				"Outbox flush should be called",
			);
		});

		it("should pop staged batches and call rollback", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});

			// Simulate popStagedBatches calling the callback
			(dependencies.pendingStateManager.popStagedBatches as Sinon.SinonStub).callsFake(
				(
					callback: (args: {
						runtimeOp: LocalContainerRuntimeMessage;
						localOpMetadata: unknown;
					}) => void,
				) => {
					const mockOp: LocalContainerRuntimeMessage = {
						type: "test",
						contents: {},
					} as unknown as LocalContainerRuntimeMessage;
					callback({
						runtimeOp: mockOp,
						localOpMetadata: "meta",
					});
				},
			);

			controls.discardChanges();

			assert(
				(dependencies.pendingStateManager.popStagedBatches as Sinon.SinonStub).calledOnce,
				"popStagedBatches should be called",
			);
			assert(
				(dependencies.rollbackStagedChange as Sinon.SinonStub).calledOnce,
				"rollbackStagedChange should be called",
			);
		});

		it("should call updateDocumentDirtyState", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.discardChanges();
			assert(
				(dependencies.updateDocumentDirtyState as Sinon.SinonStub).calledOnce,
				"updateDocumentDirtyState should be called",
			);
		});

		it("should call notifyStagingMode(false)", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.discardChanges();
			assert(
				(dependencies.channelCollection.notifyStagingMode as Sinon.SinonStub).calledWith(
					false,
				),
				"notifyStagingMode should be called with false",
			);
		});

		it("should call submitIdAllocationOpIfNeeded with staged: false", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.discardChanges();
			assert(
				(dependencies.submitIdAllocationOpIfNeeded as Sinon.SinonStub).calledWith({
					staged: false,
				}),
				"submitIdAllocationOpIfNeeded should be called with staged: false",
			);
		});
	});

	describe("commitChanges", () => {
		it("should flush outbox", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.commitChanges();
			assert(
				(dependencies.outbox.flush as Sinon.SinonStub).called,
				"Outbox flush should be called",
			);
		});

		it("should replay pending states", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.commitChanges();
			assert(
				(dependencies.pendingStateManager.replayPendingStates as Sinon.SinonStub).calledWith({
					committingStagedBatches: true,
					squash: false,
				}),
				"replayPendingStates should be called with correct options",
			);
		});

		it("should replay pending states with squash option", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.commitChanges({ squash: true });
			assert(
				(dependencies.pendingStateManager.replayPendingStates as Sinon.SinonStub).calledWith({
					committingStagedBatches: true,
					squash: true,
				}),
				"replayPendingStates should be called with squash: true",
			);
		});

		it("should call notifyStagingMode(false)", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.commitChanges();
			assert(
				(dependencies.channelCollection.notifyStagingMode as Sinon.SinonStub).calledWith(
					false,
				),
				"notifyStagingMode should be called with false",
			);
		});
	});

	describe("checkpoint", () => {
		it("should flush outbox when creating checkpoint", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			controls.checkpoint();
			assert(
				(dependencies.outbox.flush as Sinon.SinonStub).called,
				"Outbox flush should be called",
			);
		});

		it("should return a checkpoint object with required methods", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();
			assert.notEqual(checkpoint.rollback, undefined, "Should have rollback method");
			assert.notEqual(checkpoint.dispose, undefined, "Should have dispose method");
			assert.equal(typeof checkpoint.isValid, "boolean", "Should have isValid property");
			assert.equal(
				typeof checkpoint.hasChangesSince,
				"boolean",
				"Should have hasChangesSince property",
			);
		});

		it("checkpoint.isValid should be true initially", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();
			assert.equal(checkpoint.isValid, true);
		});

		it("checkpoint.isValid should be false after rollback", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();
			checkpoint.rollback();
			assert.equal(checkpoint.isValid, false);
		});

		it("checkpoint.hasChangesSince should be false when no changes", () => {
			const msg1 = { id: 1 };
			mockLastStagedMessage.value = msg1;

			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();

			// Last message is still the same
			assert.equal(checkpoint.hasChangesSince, false);
		});

		it("checkpoint.hasChangesSince should be true when messages added", () => {
			const msg1 = { id: 1 };
			mockLastStagedMessage.value = msg1;

			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();

			// Simulate messages being added after checkpoint
			const msg2 = { id: 2 };
			mockLastStagedMessage.value = msg2;

			assert.equal(checkpoint.hasChangesSince, true);
		});

		it("checkpoint.hasChangesSince should be true when outbox has messages", () => {
			mockMainBatchMessageCount.value = 0;
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();
			mockMainBatchMessageCount.value = 2;
			assert.equal(checkpoint.hasChangesSince, true);
		});

		it("checkpoint.rollback should throw when invalid", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();
			checkpoint.rollback();
			assert.throws(() => checkpoint.rollback(), /Cannot rollback an invalid checkpoint/);
		});

		it("checkpoint.dispose should throw when invalid", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();
			checkpoint.dispose();
			assert.throws(() => checkpoint.dispose(), /Cannot dispose an invalid checkpoint/);
		});

		it("checkpoint.rollback should call popStagedMessagesAfter with correct reference", () => {
			const msg1 = { id: 1 };
			mockLastStagedMessage.value = msg1;

			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();

			// Simulate messages being added after checkpoint
			const msg2 = { id: 2 };
			mockLastStagedMessage.value = msg2;

			checkpoint.rollback();
			assert(
				(dependencies.pendingStateManager.popStagedBatches as Sinon.SinonStub).calledWith(
					Sinon.match.func,
					msg1,
				),
				"popStagedBatches should be called with callback and checkpoint message reference",
			);
		});
		it("multiple checkpoints should work independently", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});

			const msg1 = { id: 1 };
			mockLastStagedMessage.value = msg1;
			const checkpoint1 = controls.checkpoint();

			const msg2 = { id: 2 };
			mockLastStagedMessage.value = msg2;
			const checkpoint2 = controls.checkpoint();

			assert.equal(checkpoint1.isValid, true);
			assert.equal(checkpoint2.isValid, true);

			checkpoint2.rollback();
			assert.equal(checkpoint1.isValid, true, "checkpoint1 should still be valid");
			assert.equal(checkpoint2.isValid, false, "checkpoint2 should be invalid");
		});

		it("rolling back earlier checkpoint should invalidate later ones", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});

			const msg1 = { id: 1 };
			mockLastStagedMessage.value = msg1;
			const checkpoint1 = controls.checkpoint();

			const msg2 = { id: 2 };
			mockLastStagedMessage.value = msg2;
			const checkpoint2 = controls.checkpoint();

			checkpoint1.rollback();
			assert.equal(checkpoint1.isValid, false);
			assert.equal(checkpoint2.isValid, false, "checkpoint2 should also be invalidated");
		});

		it("exiting staging mode should invalidate all checkpoints", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});

			const checkpoint1 = controls.checkpoint();
			const checkpoint2 = controls.checkpoint();

			controls.discardChanges();

			assert.equal(checkpoint1.isValid, false);
			assert.equal(checkpoint2.isValid, false);
		});
	});

	describe("error handling", () => {
		it("should call closeFn when exitStagingMode throws", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});

			// Make popStagedBatches throw
			(dependencies.pendingStateManager.popStagedBatches as Sinon.SinonStub).throws(
				new Error("Test error"),
			);

			assert.throws(() => controls.discardChanges());
			assert(
				(dependencies.closeFn as Sinon.SinonStub).called,
				"closeFn should be called on error",
			);
		});

		it("should call closeFn when checkpoint rollback throws", () => {
			const manager = new StagingModeManager(dependencies);
			const controls = manager.enterStagingMode(() => {});
			const checkpoint = controls.checkpoint();

			// Make popStagedBatches throw
			(dependencies.pendingStateManager.popStagedBatches as Sinon.SinonStub).throws(
				new Error("Test error"),
			);

			assert.throws(() => checkpoint.rollback());
			assert(
				(dependencies.closeFn as Sinon.SinonStub).called,
				"closeFn should be called on error",
			);
		});
	});
});
