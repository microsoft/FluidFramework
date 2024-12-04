import { strict as assert } from "assert";
import sinon from "sinon";
import { runWithRetry } from "../runWithRetry";

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

		try {
			await runWithRetry(apiStub, "testApi", maxRetries, retryAfterMs);
		} catch (error) {
			// Expected to throw
		}

		assert.equal(apiStub.callCount, maxRetries + 1);
	});

	it("should not retry on success", async () => {
		apiStub.resolves("Success");

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const result = await runWithRetry(apiStub, "testApi", maxRetries, retryAfterMs);

		assert.equal(apiStub.callCount, 1);
		assert.equal(result, "Success");
	});

	it("should wait the correct interval between retries", async () => {
		apiStub.onCall(0).rejects(new Error("Test error"));
		apiStub.onCall(1).resolves("Success");

		const maxRetries = 3;
		const retryAfterMs = 1000;

		const promise = runWithRetry(apiStub, "testApi", maxRetries, retryAfterMs);

		await clock.tickAsync(retryAfterMs);

		const result = await promise;

		assert.equal(apiStub.callCount, 2);
		assert.equal(result, "Success");
	});

	it("should stop retrying if shouldRetry returns false", async () => {
		apiStub.rejects(new Error("Test error"));

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const shouldRetry = sinon.stub().returns(false);

		try {
			await runWithRetry(
				apiStub,
				"testApi",
				maxRetries,
				retryAfterMs,
				{},
				undefined,
				shouldRetry,
			);
		} catch (error) {
			// Expected to throw
		}

		assert.equal(apiStub.callCount, 1);
	});

	it("should call onErrorFn on error", async () => {
		apiStub.rejects(new Error("Test error"));

		const maxRetries = 3;
		const retryAfterMs = 1000;
		const onErrorFn = sinon.spy();

		try {
			await runWithRetry(
				apiStub,
				"testApi",
				maxRetries,
				retryAfterMs,
				{},
				undefined,
				undefined,
				undefined,
				onErrorFn,
			);
		} catch (error) {
			// Expected to throw
		}

		assert.equal(onErrorFn.callCount, maxRetries + 1);
	});
});
