/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockDeltaManager } from "@fluidframework/test-runtime-utils/internal";

import { DeltaManagerSummarizerProxy } from "../deltaManagerProxies.js";

describe("DeltaManagerSummarizerProxy", () => {
	it("should not wrap non-summarizers", () => {
		const mockDeltaManager = new MockDeltaManager();
		const proxy = DeltaManagerSummarizerProxy.wrapIfSummarizer(mockDeltaManager);
		assert.equal(proxy, mockDeltaManager);
	});
	it("should override active and readOnlyInfo properties", () => {
		const mockDeltaManager = new MockDeltaManager();
		mockDeltaManager.clientDetails.type = "summarizer";
		const proxy = DeltaManagerSummarizerProxy.wrapIfSummarizer(mockDeltaManager);

		assert.equal(proxy.active, false, "active should be false for summarizer");
		assert.equal(
			proxy.readOnlyInfo.readonly,
			true,
			"readOnlyInfo.readonly should be true for summarizer",
		);
	});
	it("should not emit readonly event when underlying delta manager emits it", () => {
		const mockDeltaManager = new MockDeltaManager();

		mockDeltaManager.clientDetails.type = "summarizer";
		const proxy = DeltaManagerSummarizerProxy.wrapIfSummarizer(mockDeltaManager);
		let eventTriggered = false;

		proxy.on("readonly", () => {
			eventTriggered = true;
		});

		mockDeltaManager.emit("readonly", false, { reason: "Test reason" });

		assert.equal(eventTriggered, false, "readonly event should not be triggered");
		assert.equal(
			proxy.readOnlyInfo.readonly,
			true,
			"readOnlyInfo.readonly should be true for summarizer",
		);
	});

	it("should handle active state changes correctly", () => {
		const mockDeltaManager = new MockDeltaManager();
		mockDeltaManager.clientDetails.type = "summarizer";
		const proxy = DeltaManagerSummarizerProxy.wrapIfSummarizer(mockDeltaManager);

		mockDeltaManager.active = false;

		assert.equal(proxy.active, false, "active should initially be false for summarizer");

		mockDeltaManager.active = true;
		assert.equal(proxy.active, false, "proxy should alway report active as false");
	});

	it("should handle readonly state changes correctly", () => {
		const mockDeltaManager = new MockDeltaManager();
		mockDeltaManager.clientDetails.type = "summarizer";
		const proxy = DeltaManagerSummarizerProxy.wrapIfSummarizer(mockDeltaManager);

		mockDeltaManager.readOnlyInfo = {
			readonly: true,
			forced: false,
			permissions: undefined,
			storageOnly: false,
		};
		assert.equal(
			proxy.readOnlyInfo.readonly,
			true,
			"readonly should initially be true for summarizer",
		);

		mockDeltaManager.readOnlyInfo = { readonly: false };
		assert.equal(
			proxy.readOnlyInfo.readonly,
			true,
			"readonly should remain true for summarizer",
		);
	});
});
