/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IProvideLayerCompatDetails } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import type {
	ConnectionStatus,
	IContainerContext,
} from "@fluidframework/container-definitions/internal";
import type {
	IDocumentServiceFactory,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import { createEmptyRuntimeCodeLoader, createEmptyRuntimeFactory } from "../emptyRuntime.js";
import { Loader } from "../loader.js";

import { AbsentProperty, failProxy, failSometimeProxy } from "./failProxy.js";

const documentServiceFactoryFailProxy = failSometimeProxy<
	IDocumentServiceFactory & IProvideLayerCompatDetails
>({
	ILayerCompatDetails: AbsentProperty,
});

describe("createEmptyRuntimeCodeLoader", () => {
	it("produces a runtime that never sends ops or signals", async () => {
		let opsSent = 0;
		let signalsSent = 0;
		const pendingLocalState = { stashed: "state" };
		const context = failSometimeProxy<IContainerContext>({
			pendingLocalState,
			submitFn: () => {
				opsSent++;
				return 0;
			},
			submitBatchFn: () => {
				opsSent++;
				return 0;
			},
			submitSummaryFn: () => {
				opsSent++;
				return 0;
			},
			submitSignalFn: () => {
				signalsSent++;
			},
		});

		const codeLoader = createEmptyRuntimeCodeLoader();
		const { module } = await codeLoader.load({ package: "none" });
		const factory = module.fluidExport.IRuntimeFactory;
		assert(factory !== undefined, "module should export an IRuntimeFactory");

		const runtime = await factory.instantiateRuntime(context, true /* existing */);

		// Exercise every member; a real runtime might send ops/signals in response to some of these.
		const dummyMessage = {} as unknown as ISequencedDocumentMessage;
		runtime.setConnectionState(true, "client-id");
		runtime.setConnectionStatus?.({} as unknown as ConnectionStatus);
		runtime.process(dummyMessage, true);
		runtime.processSignal({}, true);
		runtime.setAttachState(AttachState.Attaching);
		await runtime.notifyOpReplay?.(dummyMessage);

		assert.throws(
			() => runtime.createSummary(),
			/does not support summarization/,
			"empty runtime should throw when asked to summarize",
		);
		assert.strictEqual(
			runtime.getPendingLocalState(),
			pendingLocalState,
			"getPendingLocalState should echo the pending state provided on the context",
		);
		assert.notStrictEqual(
			await runtime.getEntryPoint(),
			undefined,
			"getEntryPoint should resolve to an entry point object",
		);

		assert.strictEqual(runtime.disposed, false);
		runtime.close?.();
		runtime.dispose();
		assert.strictEqual(runtime.disposed, true, "runtime should be disposed after dispose()");

		assert.strictEqual(opsSent, 0, "empty runtime must never send ops");
		assert.strictEqual(signalsSent, 0, "empty runtime must never send signals");
	});

	it("cannot create a new (detached) container", async () => {
		const loader = new Loader({
			codeLoader: createEmptyRuntimeCodeLoader(),
			documentServiceFactory: documentServiceFactoryFailProxy,
			urlResolver: failProxy(),
		});

		await assert.rejects(
			async () => loader.createDetachedContainer({ package: "none" }),
			/can only be used to load existing/,
			"creating a detached container backed by the empty runtime should throw",
		);
	});

	it("createEmptyRuntimeFactory produces the same empty runtime", async () => {
		const factory = createEmptyRuntimeFactory();
		assert.strictEqual(
			factory.IRuntimeFactory,
			factory,
			"IRuntimeFactory should be the factory itself",
		);

		await assert.rejects(
			async () => factory.instantiateRuntime(failSometimeProxy<IContainerContext>({}), false),
			/can only be used to load existing/,
			"instantiating for a new container should throw",
		);

		const runtime = await factory.instantiateRuntime(
			failSometimeProxy<IContainerContext>({ pendingLocalState: undefined }),
			true /* existing */,
		);
		assert.strictEqual(runtime.disposed, false, "runtime should start not disposed");
	});
});
