/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TestContext } from "@fluidframework/server-test-utils";
import { LambdaCircuitBreaker, circuitBreakerOptions } from "../../utils/circuitBreaker";

describe("Lambda CircuitBreaker", () => {
	let circuitBreaker: LambdaCircuitBreaker;
	const resetTimeout = 1000;
	const options: circuitBreakerOptions = {
		errorThresholdPercentage: 0.001,
		resetTimeout: resetTimeout,
		timeout: false,
		rollingCountTimeout: 1000,
		rollingCountBuckets: 1000,
	};
	const testContext = new TestContext();

	const dependencyName = "dummyDependency";
	const successfulResponse = "Dummy action completed";
	const errorResponse = "Dummy action failed";
	const healthCheckSuccessResponse = "Health check successful";
	const healthCheckFailedResponse = "Health check failed";
	const dummyFunction = async (success = true, timeoutMs = 0) => {
		if (timeoutMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, timeoutMs));
		}
		return success
			? Promise.resolve(successfulResponse)
			: Promise.reject(new Error(errorResponse));
	};
	const dummyHealthCheck = async (success = true) => {
		await new Promise((resolve) => setTimeout(resolve, 100));
		return success
			? Promise.resolve(healthCheckSuccessResponse)
			: Promise.reject(new Error(healthCheckFailedResponse));
	};

	afterEach(() => {
		circuitBreaker["circuitBreaker"].close();
		circuitBreaker.shutdown();
	});

	it("should execute the function successfully when the circuit is closed", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			options,
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
		);
		const response = await circuitBreaker.execute([]);
		assert.strictEqual(response, successfulResponse);
		await new Promise((resolve) => setTimeout(resolve, 1000));
		assert.strictEqual(circuitBreaker.getCurrentState(), "closed");
	});

	it("should open the circuit when execution fails, and fail immediately for further requests", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			options,
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
		);

		await assert.rejects(circuitBreaker.execute([false]), {
			message: errorResponse,
			circuitBreakerOpen: true,
		});
		assert.strictEqual(circuitBreaker.getCurrentState(), "opened");

		// Execute the function again, this time it should reject immediately without calling the action
		await circuitBreaker.execute([]).catch((error) => {
			assert.notEqual(error.message, errorResponse); // indicates that the action was not called
			assert.strictEqual(error.circuitBreakerOpen, true);
		});
		assert.strictEqual(circuitBreaker.getCurrentState(), "opened");
	});

	it("should not open the circuit breaker if errorFilter returns true even though the function returned an error", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			{
				...options,
				errorFilter: (_) => {
					return true;
				},
			},
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
		);
		try {
			await circuitBreaker.execute([false]);
		} catch (error) {
			assert.strictEqual(error["message"], errorResponse);
			assert.strictEqual(error["circuitBreakerOpen"], undefined);
		}
		assert.strictEqual(circuitBreaker.getCurrentState(), "closed");
		// requests are successful confirming the closed state
		const response = await circuitBreaker.execute([]);
		assert.strictEqual(response, successfulResponse);
	});

	it("should halfOpen the circuit after resetTimeout and close the circuit if healthCheck is successful", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			options,
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
		);

		await assert.rejects(circuitBreaker.execute([false]), {
			message: errorResponse,
			circuitBreakerOpen: true,
		});
		assert.strictEqual(circuitBreaker.getCurrentState(), "opened");

		await new Promise((resolve) => setTimeout(resolve, resetTimeout));
		assert.strictEqual(circuitBreaker.getCurrentState(), "halfOpen");
		await new Promise((resolve) => setTimeout(resolve, 100)); // let health check complete

		assert.strictEqual(circuitBreaker.getCurrentState(), "closed");
		const response = await circuitBreaker.execute([]);
		assert.strictEqual(response, successfulResponse);
	});

	it("should halfOpen the circuit after resetTimeout and open the circuit if healthCheck is failing", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			options,
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
			[false],
		);

		await assert.rejects(circuitBreaker.execute([false]), {
			message: errorResponse,
			circuitBreakerOpen: true,
		});
		assert.strictEqual(circuitBreaker.getCurrentState(), "opened");

		await new Promise((resolve) => setTimeout(resolve, resetTimeout));
		assert.strictEqual(circuitBreaker.getCurrentState(), "halfOpen");
		await new Promise((resolve) => setTimeout(resolve, 100)); // let health check complete

		assert.strictEqual(circuitBreaker.getCurrentState(), "opened");
		await circuitBreaker.execute([]).catch((error) => {
			assert.notEqual(error.message, errorResponse); // indicates that the action was not called
			assert.strictEqual(error.circuitBreakerOpen, true);
		});
	});

	it("should open the circuit if any one out of multiple parallel calls fail and pending requests resolving should not close the circuit", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			options,
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
		);
		const promises = [];

		// successful case
		promises.push(
			circuitBreaker.execute([true, 100]).then((response) => {
				assert.strictEqual(response, successfulResponse);
			}),
		);

		// failure case - this should open the circuit
		promises.push(
			circuitBreaker
				.execute([false, 0])
				.then((_) => {
					assert.fail("Should not reach here");
				})
				.catch((error) => {
					assert.strictEqual(error.message, errorResponse);
					assert.strictEqual(error.circuitBreakerOpen, true);
					assert.strictEqual(circuitBreaker.getCurrentState(), "opened");
				}),
		);

		// circuit should remain opened even when the successful case resolved
		Promise.all(promises).then((_) => {
			assert.strictEqual(circuitBreaker.getCurrentState(), "opened");
		});
	});

	it("should fallback to restart if not closed for a long time", async () => {
		circuitBreaker = new LambdaCircuitBreaker(
			{ ...options, resetTimeout: 100, fallbackToRestartTimeoutMs: 1000 },
			testContext,
			dependencyName,
			dummyFunction,
			dummyHealthCheck,
			[false],
		);

		testContext.on("error", (error, errorData) => {
			assert.strictEqual(error.message, errorResponse);
			assert.strictEqual(errorData.restart, true);
		});

		await assert.rejects(circuitBreaker.execute([false]), {
			message: errorResponse,
			circuitBreakerOpen: true,
		});
		assert.strictEqual(circuitBreaker.getCurrentState(), "opened");
		await new Promise((resolve) => setTimeout(resolve, 1000));
	});
});
