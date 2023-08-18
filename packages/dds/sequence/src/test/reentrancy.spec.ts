/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTreeDeltaType } from "@fluidframework/merge-tree";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { SharedString } from "../sharedString";
import { resetReentrancyLogCounter } from "../sequence";

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
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				dataStoreRuntime1.local = true;
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
			dataStoreRuntime1.local = false;
			dataStoreRuntime1.options = { sharedStringPreventReentrancy: false };
			sharedString = factory.create(dataStoreRuntime1, "A");

			const containerRuntime1 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: containerRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedString.connect(services1);

			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			dataStoreRuntime2.options = { sharedStringPreventReentrancy: false };
			dataStoreRuntime2.local = false;
			const containerRuntime2 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: containerRuntime2.createDeltaConnection(),
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
