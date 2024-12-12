/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import CircuitBreaker from "opossum";
import { serializeError } from "serialize-error";
import { IContext } from "@fluidframework/server-services-core";
import { Lumberjack, Lumber, LumberEventName } from "@fluidframework/server-services-telemetry";

export interface circuitBreakerOptions {
	errorThresholdPercentage: number; // Percentage of errors before opening the circuit
	resetTimeout: number; // Time in milliseconds before attempting to close the circuit after it has been opened, i.e. it will go to halfOpen state after resetTimeout
	timeout: boolean; // Time in milliseconds before a request is considered timed out, if it is set to false, timeout will be disabled
	rollingCountTimeout: number; // Time in milliseconds before the rolling window resets for errorThresholdPercentage calculation
	rollingCountBuckets: number; // Number of buckets in the rolling window for errorThresholdPercentage calculation
	errorFilter?: (error: any) => boolean; // Function to filter errors - if it returns true for certain errors, they will not open the circuit
	fallbackToRestartTimeoutMs?: number; // Time in milliseconds to wait before restarting the service if the circuit breaker is not closed
}

// executes `functionCall` with `args`
async function wrapperCircuitBreakerAction(
	functionCall: (...args: any[]) => Promise<any>,
	args: any[],
): Promise<any> {
	return functionCall(...args);
}

export class LambdaCircuitBreaker {
	private readonly circuitBreaker: CircuitBreaker;
	private readonly context: IContext;
	private readonly dependencyName: string;
	private readonly executeFunction: (...args: any[]) => Promise<any>;
	private readonly healthCheckFunction: (...args: any[]) => Promise<any>;
	private readonly healthCheckParams: any[] = [];
	private readonly fallbackToRestartTimeoutMs: number = 180000; // 3 minutes by default

	// following properties are used for telemetry and reset when the circuit breaker is closed
	private circuitBreakerMetric: Lumber<LumberEventName.CircuitBreaker> | undefined;
	private circuitBreakerOpenCount: number = 0;
	private error: any;
	private fallbackToRestartTimeout: NodeJS.Timeout | undefined; // timeout to restart the service if the circuit breaker is not closed for more than fallbackToRestartTimeoutMs

	constructor(
		circuitBreakerOptions: circuitBreakerOptions,
		context: IContext,
		dependencyName: string,
		executeFunction: (...args: any[]) => Promise<any>,
		healthCheckFunction: (...args: any[]) => Promise<any>,
		healthCheckParams?: any[],
	) {
		this.context = context;
		this.dependencyName = dependencyName;
		this.executeFunction = executeFunction;
		this.healthCheckFunction = healthCheckFunction;
		this.healthCheckParams = healthCheckParams ?? [];
		this.fallbackToRestartTimeoutMs =
			circuitBreakerOptions.fallbackToRestartTimeoutMs ?? this.fallbackToRestartTimeoutMs;

		const lambdaErrorFilter = circuitBreakerOptions.errorFilter;

		this.circuitBreaker = new CircuitBreaker(wrapperCircuitBreakerAction, {
			errorThresholdPercentage: circuitBreakerOptions.errorThresholdPercentage,
			resetTimeout: circuitBreakerOptions.resetTimeout,
			timeout: circuitBreakerOptions.timeout,
			rollingCountTimeout: circuitBreakerOptions.rollingCountTimeout,
			rollingCountBuckets: circuitBreakerOptions.rollingCountBuckets,
			errorFilter: (error): boolean => {
				if (error.healthCheckFailed) {
					// open the circuit breaker if health check fails with any error, else use lambdaErrorFilter
					return false;
				}
				return lambdaErrorFilter ? lambdaErrorFilter(error) : false;
			},
		});

		this.circuitBreaker.on("open", () => this.openCallback());
		this.circuitBreaker.on("close", () => this.closeCallback());
		this.circuitBreaker.on("halfOpen", () => this.halfOpenCallback());
		this.circuitBreaker.on("failure", (err) => this.failureCallback(err)); // Emitted when the circuit breaker action fails
		this.circuitBreaker.on("reject", (err) => this.rejectCallback(err)); // Emitted when the circuit breaker is in open state (failing fast) and action is fired
	}

	public async execute(params: any[], doHealthCheck?: boolean): Promise<void> {
		const functionToFire =
			doHealthCheck && this.healthCheckFunction
				? this.healthCheckFunction
				: this.executeFunction;
		return this.circuitBreaker.fire(functionToFire, params); // calls wrapperCircuitBreakerAction with these params
	}

	public getCurrentState(): string {
		return this.circuitBreaker.opened
			? "opened"
			: this.circuitBreaker.halfOpen
			? "halfOpen"
			: "closed";
	}

	public shutdown(): void {
		this.circuitBreaker.shutdown();
	}

	private openCallback(): void {
		// telemetry for circuit breaker open
		this.circuitBreakerOpenCount++;
		if (this.circuitBreakerMetric) {
			// opening the circuit agan after halfOpen state
			this.circuitBreakerMetric.setProperty("openCount", this.circuitBreakerOpenCount);
		} else {
			// opening the circuit first time, create new metric
			this.circuitBreakerMetric = Lumberjack.newLumberMetric(LumberEventName.CircuitBreaker, {
				timestampOpened: new Date().toISOString(),
				dependencyName: this.dependencyName,
				error: serializeError(this.error),
				openCount: this.circuitBreakerOpenCount,
			});

			// setup the fallback to restart the service if the circuit breaker is not closed for more than fallbackToRestartTimeoutMs
			this.setupRestartFallback(this.error);
		}
		Lumberjack.info("Circuit breaker opened", {
			metricId: this.circuitBreakerMetric.id,
			error: serializeError(this.error),
		});
	}

	private closeCallback(): void {
		// resume lambda.
		this.context.resume();

		// telemetry for circuit breaker closed
		const metricProperties = {
			timestampClosed: new Date().toISOString(),
			openCount: this.circuitBreakerOpenCount,
			state: this.circuitBreaker.toJSON()?.state,
		};
		if (this.circuitBreakerMetric) {
			this.circuitBreakerMetric?.setProperties(metricProperties);
			this.circuitBreakerMetric?.success("Circuit breaker closed");
		} else {
			Lumberjack.info("Circuit breaker closed", metricProperties);
		}

		// Reset the circuit breaker telemetry and fallback
		this.resetTelemetryAndFallback();
	}

	private halfOpenCallback(): void {
		Lumberjack.info("Circuit breaker halfOpen", {
			metricId: this.circuitBreakerMetric?.id,
		});

		// check the health of the dependency service, and let circuit breaker change its state accordingly
		this.execute(this.healthCheckParams, true).catch((error) => {
			Lumberjack.error(
				"Circuit breaker health check failed in halfOpen state, circuit will remain open.",
				{ metricId: this.circuitBreakerMetric?.id },
				error,
			);
		});
	}

	private failureCallback(error: any): void {
		this.error = error;
		error.circuitBreakerOpen = true;
	}

	private rejectCallback(error: any): void {
		error.circuitBreakerOpen = true;
	}

	private setupRestartFallback(initialError: any): void {
		this.fallbackToRestartTimeout = setTimeout(() => {
			if (!this.circuitBreaker.closed) {
				this.circuitBreakerMetric?.setProperties({
					openCount: this.circuitBreakerOpenCount,
					timestampFallbackToRestart: new Date().toISOString(),
					state: this.circuitBreaker.toJSON()?.state,
					fallbackToRestartTimeoutMs: this.fallbackToRestartTimeoutMs,
				});
				this.circuitBreakerMetric?.error(
					"Circuit breaker not closed for a long time, going to restart the service",
				);
				this.context.error(initialError, {
					restart: true,
					errorLabel: "circuitBreaker:fallbackToRestartTimeout",
				});
			}
		}, this.fallbackToRestartTimeoutMs);
	}

	private resetTelemetryAndFallback(): void {
		// clear the fallback to restart timeout
		if (this.fallbackToRestartTimeout !== undefined) {
			clearTimeout(this.fallbackToRestartTimeout);
			this.fallbackToRestartTimeout = undefined;
		}

		// reset the circuit breaker metric and count
		this.circuitBreakerMetric = undefined;
		this.circuitBreakerOpenCount = 0;

		// reset the error
		this.error = undefined;
	}
}
