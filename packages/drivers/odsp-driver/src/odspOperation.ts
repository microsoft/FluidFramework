/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { getRetryDelayFromError } from "@fluidframework/driver-utils/internal";
import {
	createChildLogger,
	isFluidError,
	LoggingError,
	normalizeError,
	type IFluidErrorBase,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid, v5 as targetUuid } from "uuid";

interface OperationScope {
	readonly id: string;
	readonly targetSalt: string;
	readonly abort: AbortController;
	inFlightRequests: number;
}

const scopes = new WeakMap<object, OperationScope>();

function getScope(owner: object): OperationScope {
	let scope = scopes.get(owner);
	if (scope === undefined) {
		scope = {
			id: uuid(),
			targetSalt: uuid(),
			abort: new AbortController(),
			inFlightRequests: 0,
		};
		scopes.set(owner, scope);
	}
	return scope;
}

/** Identifies a target only within one randomly salted client scope. */
export function getOdspTargetId(owner: object, target: string): string {
	return targetUuid(target, getScope(owner).targetSalt);
}

export function disposeOdspOperations(owner: object): void {
	getScope(owner).abort.abort();
}

type Outcome = "succeeded" | "failed" | "exhausted" | "abandoned";

function getServerRetryAfterMs(error: unknown): number | undefined {
	if (isFluidError(error)) {
		const value = error.getTelemetryProperties().serverRetryAfterMs;
		return typeof value === "number" ? value : undefined;
	}
	return undefined;
}

/**
 * Explicit context for one caller, including token refresh and coherency retries.
 * It is never stored as mutable current-operation state on a shared service.
 */
export class OdspOperation {
	public readonly id = uuid();
	public readonly logger: TelemetryLoggerExt;
	public readonly properties: ITelemetryBaseProperties;
	public readonly requestProperties: ITelemetryBaseProperties = {};
	private readonly scope: OperationScope;
	private readonly requestScope: OperationScope;
	private attempts = 0;
	private ended = false;
	private exhausted = false;
	private pendingRetry: { start: number; props: ITelemetryBaseProperties } | undefined;
	private readonly startTime = Date.now();

	public constructor(
		logger: TelemetryLoggerExt,
		owner: object,
		kind: string,
		target: string,
		caller?: string,
		private readonly signal?: AbortSignal,
		targetOwner: object = owner,
	) {
		this.scope = getScope(owner);
		this.requestScope = getScope(targetOwner);
		this.properties = {
			odspOperationId: this.id,
			odspServiceId: this.scope.id,
			odspRequestScopeId: this.requestScope.id,
			odspOperationKind: kind,
			odspTargetId: getOdspTargetId(targetOwner, target),
			joinSessionCaller: caller,
		};
		this.logger = createChildLogger({ logger, properties: { all: this.properties } });
	}

	public checkDisposed(): void {
		if (this.scope.abort.signal.aborted || this.signal?.aborted === true) {
			throw new LoggingError("ODSP operation owner is disposed", {
				...this.properties,
				canRetry: false,
			});
		}
	}

	public async run<T>(api: (operation: OdspOperation) => Promise<T>): Promise<T> {
		this.logger.sendTelemetryEvent({ eventName: "OdspOperationStart", ...this.properties });
		const abandon = (): void => this.end("abandoned");
		this.scope.abort.signal.addEventListener("abort", abandon, { once: true });
		this.signal?.addEventListener("abort", abandon, { once: true });
		try {
			this.checkDisposed();
			const result = await api(this);
			this.checkDisposed();
			this.end("succeeded");
			return result;
		} catch (error) {
			const normalized = this.annotateError(error);
			this.end(
				this.scope.abort.signal.aborted || this.signal?.aborted === true
					? "abandoned"
					: this.exhausted
						? "exhausted"
						: "failed",
				normalized,
			);
			throw normalized;
		} finally {
			this.scope.abort.signal.removeEventListener("abort", abandon);
			this.signal?.removeEventListener("abort", abandon);
		}
	}

	public annotateError(error: unknown, props?: ITelemetryBaseProperties): IFluidErrorBase {
		return normalizeError(error, { props: { ...this.properties, ...props } });
	}

	public markExhausted(): void {
		this.exhausted = true;
	}

	public recordRetry(scheduledDelayMs: number, error: unknown, retryReason: string): void {
		const props = {
			retryReason,
			scheduledDelayMs,
			serverRetryAfterMs: getServerRetryAfterMs(error),
			retryDelayMs: getRetryDelayFromError(error),
			throttleScope: "operation",
			throttleGateId: this.id,
		};
		this.pendingRetry = { start: Date.now(), props };
		this.logger.sendTelemetryEvent({ eventName: "OdspRetryScheduled", ...props }, error);
	}

	public async request<T extends { propsToLog: ITelemetryBaseProperties }>(
		api: () => Promise<T>,
	): Promise<T> {
		const attempt = this.startRequest(uuid(), 0);
		try {
			const response = await api();
			Object.assign(response.propsToLog, attempt.properties);
			attempt.end(undefined, response.propsToLog);
			return response;
		} catch (error) {
			const normalized = this.annotateError(error, {
				...attempt.properties,
				serverRetryAfterMs: getRetryDelayFromError(error),
			});
			attempt.end(normalized);
			throw normalized;
		}
	}

	public startRequest(
		correlationId: string,
		waitQueueLength: number,
	): {
		readonly properties: ITelemetryBaseProperties;
		end(error?: unknown, responseProperties?: ITelemetryBaseProperties): void;
	} {
		this.checkDisposed();
		if (this.ended) {
			throw this.annotateError(
				new LoggingError("ODSP operation is already completed", {
					canRetry: false,
				}),
			);
		}
		if (this.pendingRetry !== undefined) {
			this.logger.sendTelemetryEvent({
				eventName: "OdspRetryWaitEnd",
				...this.pendingRetry.props,
				observedDelayMs: Date.now() - this.pendingRetry.start,
			});
			this.pendingRetry = undefined;
		}
		const properties = {
			...this.properties,
			...this.requestProperties,
			odspAttemptId: uuid(),
			odspAttemptNumber: ++this.attempts,
			odspRequestId: correlationId,
		};
		const start = Date.now();
		this.requestScope.inFlightRequests++;
		this.logger.sendTelemetryEvent({
			eventName: "OdspRequestStart",
			...properties,
			requestStartTime: start,
			waitQueueLength,
			inFlightRequests: this.requestScope.inFlightRequests,
		});
		return {
			properties,
			end: (error, responseProperties) => {
				this.requestScope.inFlightRequests--;
				this.logger.sendTelemetryEvent(
					{
						eventName: "OdspRequestEnd",
						...responseProperties,
						...properties,
						duration: Date.now() - start,
						requestSucceeded: error === undefined,
						serverRetryAfterMs: getServerRetryAfterMs(error),
					},
					error,
				);
			},
		};
	}

	public async waitForRetry(
		scheduledDelayMs: number,
		error: unknown,
		retryReason: string,
	): Promise<void> {
		const start = Date.now();
		const props = {
			retryReason,
			serverRetryAfterMs: getServerRetryAfterMs(error),
			retryDelayMs: getRetryDelayFromError(error),
			scheduledDelayMs,
			throttleScope: "operation",
			throttleGateId: this.id,
		};
		this.logger.sendTelemetryEvent({ eventName: "OdspRetryScheduled", ...props }, error);
		let cleanup = (): void => {};
		try {
			this.checkDisposed();
			await new Promise<void>((resolve, reject) => {
				const abort = (): void => {
					clearTimeout(timer);
					reject(this.annotateError(new LoggingError("ODSP retry owner is disposed")));
				};
				const timer = setTimeout(resolve, scheduledDelayMs);
				this.scope.abort.signal.addEventListener("abort", abort, { once: true });
				this.signal?.addEventListener("abort", abort, { once: true });
				cleanup = (): void => {
					clearTimeout(timer);
					this.scope.abort.signal.removeEventListener("abort", abort);
					this.signal?.removeEventListener("abort", abort);
				};
			});
			this.checkDisposed();
			this.logger.sendTelemetryEvent({
				eventName: "OdspRetryWaitEnd",
				...props,
				observedDelayMs: Date.now() - start,
			});
		} catch (waitError) {
			this.logger.sendTelemetryEvent(
				{
					eventName: "OdspRetryWaitCancelled",
					...props,
					observedDelayMs: Date.now() - start,
				},
				waitError,
			);
			throw waitError;
		} finally {
			cleanup();
		}
	}

	private end(outcome: Outcome, error?: unknown): void {
		if (!this.ended) {
			this.ended = true;
			this.logger.sendTelemetryEvent(
				{
					eventName: "OdspOperationEnd",
					...this.properties,
					outcome,
					httpAttempts: this.attempts,
					duration: Date.now() - this.startTime,
				},
				error,
			);
		}
	}
}
