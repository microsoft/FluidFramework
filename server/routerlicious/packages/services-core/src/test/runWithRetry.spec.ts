/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import sinon from "sinon";
import { runWithRetry, requestWithRetry } from "../runWithRetry";
import { NetworkError } from "@fluidframework/server-services-client";

describe("runWithRetry", () => {
	let apiStub: sinon.SinonStub;
	let clock: sinon.SinonFakeTimers;

	beforeEach(() => {
		apiStub = sinon.stub();
		clock = sinon.useFakeTimers();
	});

	afterEach(() => {
		sinon.restore();
	});

	it("should retry the expected number of times on failure", async () => {
		apiStub.rejects(new Error("Test error"));

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const promise = runWithRetry(
			apiStub,
			"testApi",
			maxRetries,
			retryAfterMs,
			undefined,
			undefined,
			undefined,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
		).catch(() => {
			// Expected to throw
		});

		await clock.runAllAsync();

		await promise;

		assert.equal(apiStub.callCount, maxRetries + 1);
	});

	it("should not retry on success", async () => {
		apiStub.resolves("Success");

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const result = await runWithRetry(
			apiStub,
			"testApi",
			maxRetries,
			retryAfterMs,
			undefined,
			undefined,
			undefined,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
		);

		assert.equal(apiStub.callCount, 1);
		assert.equal(result, "Success");
	});

	it("should wait the correct interval between multiple retries", async () => {
		apiStub.onCall(0).rejects(new Error("Test error"));
		apiStub.onCall(1).rejects(new Error("Test error"));
		apiStub.onCall(2).resolves("Success");

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const startTime = Date.now();
		const calculateIntervalMs = (error, numRetries, retryAfterInterval) =>
			retryAfterInterval * 2 ** numRetries;

		const promise = runWithRetry(
			apiStub,
			"testApi",
			maxRetries,
			retryAfterMs,
			undefined,
			undefined,
			undefined,
			calculateIntervalMs,
		);

		await clock.runAllAsync();

		const result = await promise;

		const endTime = Date.now();
		// The total time should be the sum of the retry intervals defined by the calculateIntervalMs function
		assert.equal(
			endTime - startTime,
			calculateIntervalMs(undefined, 0, retryAfterMs) +
				calculateIntervalMs(undefined, 1, retryAfterMs),
		);

		assert.equal(apiStub.callCount, 3);
		assert.equal(result, "Success");
	});

	it("should stop retrying if shouldRetry returns false", async () => {
		apiStub.rejects(new Error("Test error"));

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const shouldRetry = sinon.stub().returns(false);

		const promise = runWithRetry(
			apiStub,
			"testApi",
			maxRetries,
			retryAfterMs,
			{},
			undefined,
			shouldRetry,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
		).catch(() => {
			// Expected to throw
		});

		await promise;

		assert.equal(apiStub.callCount, 1);
	});

	it("should call onErrorFn on error", async () => {
		apiStub.rejects(new Error("Test error"));

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const onErrorFn = sinon.spy();

		const promise = runWithRetry(
			apiStub,
			"testApi",
			maxRetries,
			retryAfterMs,
			{},
			undefined,
			undefined,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
			onErrorFn,
		).catch(() => {
			// Expected to throw
		});
		await clock.runAllAsync();
		await promise;

		assert.equal(onErrorFn.callCount, maxRetries + 1);
	});
});

describe("requestWithRetry", () => {
	let requestStub: sinon.SinonStub;
	let clock: sinon.SinonFakeTimers;

	beforeEach(() => {
		requestStub = sinon.stub();
		clock = sinon.useFakeTimers();
	});

	afterEach(() => {
		sinon.restore();
	});

	it("should retry the expected number of times on failure", async () => {
		requestStub.rejects(new NetworkError(500, "Test error", true /* canRetry */));

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const promise = requestWithRetry(
			requestStub,
			"testRequest",
			undefined,
			undefined,
			maxRetries,
			retryAfterMs,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
		).catch(() => {
			// Expected to throw
		});

		await clock.runAllAsync();

		await promise;

		assert.equal(requestStub.callCount, maxRetries + 1);
	});

	it("should not retry on success", async () => {
		requestStub.resolves("Success");

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const result = await requestWithRetry(
			requestStub,
			"testRequest",
			undefined,
			undefined,
			maxRetries,
			retryAfterMs,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
		);

		assert.equal(requestStub.callCount, 1);
		assert.equal(result, "Success");
	});

	it("should wait the correct interval between multiple retries", async () => {
		requestStub.rejects(new NetworkError(500, "Test error", true /* canRetry */));
		requestStub.rejects(new NetworkError(500, "Test error", true /* canRetry */));
		requestStub.onCall(2).resolves("Success");

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const startTime = Date.now();
		const calculateIntervalMs = (error, numRetries, retryAfterInterval) =>
			retryAfterInterval * 2 ** numRetries;

		const promise = requestWithRetry(
			requestStub,
			"testRequest",
			undefined,
			undefined,
			maxRetries,
			retryAfterMs,
			calculateIntervalMs,
		);

		await clock.runAllAsync();

		const result = await promise;

		const endTime = Date.now();
		// The total time should be the sum of the retry intervals defined by the calculateIntervalMs function
		assert.equal(
			endTime - startTime,
			calculateIntervalMs(undefined, 0, retryAfterMs) +
				calculateIntervalMs(undefined, 1, retryAfterMs),
		);

		assert.equal(requestStub.callCount, 3);
		assert.equal(result, "Success");
	});

	it("should stop retrying if network error canRetry is false", async () => {
		requestStub.rejects(new NetworkError(404, "Test error", false /* canRetry */));

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const promise = requestWithRetry(
			requestStub,
			"testRequest",
			undefined,
			undefined,
			maxRetries,
			retryAfterMs,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
		).catch(() => {
			// Expected to throw
		});

		await promise;

		assert.equal(requestStub.callCount, 1);
	});

	it("should call onErrorFn on error", async () => {
		requestStub.rejects(new NetworkError(500, "Test error", true /* canRetry */));

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const onErrorFn = sinon.spy();

		const promise = requestWithRetry(
			requestStub,
			"testRequest",
			undefined,
			undefined,
			maxRetries,
			retryAfterMs,
			(error, numRetries, retryAfterInterval) => retryAfterInterval,
			onErrorFn,
		).catch(() => {
			// Expected to throw
		});
		await clock.runAllAsync();
		await promise;

		assert.equal(onErrorFn.callCount, maxRetries + 1);
	});
});
