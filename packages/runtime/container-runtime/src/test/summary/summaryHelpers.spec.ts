/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainer, ILoader } from "@fluidframework/container-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import sinon from "sinon";

import { formCreateSummarizerFn, type ISummarizer } from "../../summary/index.js";

describe("formCreateSummarizerFn", () => {
	const summarizer = {} as unknown as ISummarizer;
	let getEntryPoint: sinon.SinonStub;
	let close: sinon.SinonStub;
	let createSummarizer: () => Promise<ISummarizer>;

	beforeEach(() => {
		getEntryPoint = sinon.stub();
		close = sinon.stub();
		const container = { getEntryPoint, close } as unknown as IContainer;
		createSummarizer = formCreateSummarizerFn({
			resolve: async () => container,
		} as unknown as ILoader);
	});

	it("closes the container and preserves the entry-point error", async () => {
		const error = new Error("Entry point acquisition failed");
		getEntryPoint.rejects(error);

		await assert.rejects(createSummarizer, (actual: unknown) => actual === error);
		sinon.assert.calledOnce(close);
	});

	it("preserves the entry-point error when close throws", async () => {
		const error = new Error("Entry point acquisition failed");
		getEntryPoint.rejects(error);
		close.throws(new Error("Cleanup failed"));

		await assert.rejects(createSummarizer, (actual: unknown) => actual === error);
		sinon.assert.calledOnce(close);
	});

	it("closes the container and propagates the validation error", async () => {
		getEntryPoint.resolves({});

		await assert.rejects(
			createSummarizer,
			(error: unknown) =>
				error instanceof UsageError &&
				error.message === "Fluid object does not implement ISummarizer",
		);
		sinon.assert.calledOnce(close);
	});

	it("propagates the validation error when close throws", async () => {
		getEntryPoint.resolves({});
		close.throws(new Error("Cleanup failed"));

		await assert.rejects(
			createSummarizer,
			(error: unknown) =>
				error instanceof UsageError &&
				error.message === "Fluid object does not implement ISummarizer",
		);
		sinon.assert.calledOnce(close);
	});

	it("returns the summarizer without closing the container", async () => {
		getEntryPoint.resolves({ ISummarizer: summarizer });

		assert.equal(await createSummarizer(), summarizer);
		sinon.assert.calledOnce(getEntryPoint);
		sinon.assert.notCalled(close);
	});

	it("propagates loader.resolve rejection before a container is acquired", async () => {
		const error = new Error("Container resolution failed");
		const resolve = sinon.stub().rejects(error);
		const create = formCreateSummarizerFn({ resolve } as unknown as ILoader);

		await assert.rejects(create, (actual: unknown) => actual === error);
		sinon.assert.calledOnce(resolve);
		sinon.assert.notCalled(getEntryPoint);
		sinon.assert.notCalled(close);
	});
});
