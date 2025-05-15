/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import {
	ITelemetryContextProperties,
	ITelemetryContext,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import {
	NetworkError,
	ITimeoutContext,
	type IAbortControllerContext,
} from "@fluidframework/server-services-client";

/**
 * @internal
 */
export class AsyncLocalStorageContextProvider<T> {
	private readonly asyncLocalStorage = new AsyncLocalStorage<T>();

	/**
	 * Bind new properties to the asynchronous context.
	 * If properties are a key-value record, new entries will be appended to the existing record.
	 * Otherwise, the old context will be overwritten with the new context.
	 */
	public bindContext(props: T, callback: () => void): void {
		// Extend existing properties if props are a key-value record.
		// Otherwise, overwrite existing props with new props.
		const existingProps = this.getContext();
		const newProperties: T =
			typeof props === "object" && !Array.isArray(props)
				? { ...existingProps, ...props }
				: props;
		// Anything within callback context will have access to properties.
		this.asyncLocalStorage.run(newProperties, () => callback());
	}

	/**
	 * Get any properties bound to the asynchronous context.
	 */
	public getContext(): T | undefined {
		return this.asyncLocalStorage.getStore();
	}
}

/**
 * AsyncLocalStorage based TelemetryContext implementation.
 * Callbacks are executed within an AsyncContext containing telemetry properties.
 * @internal
 */
export class AsyncLocalStorageTelemetryContext implements ITelemetryContext {
	private readonly contextProvider = new AsyncLocalStorageContextProvider<
		Partial<ITelemetryContextProperties>
	>();

	public getProperties(): Partial<ITelemetryContextProperties> {
		return this.contextProvider.getContext() ?? {};
	}

	public bindProperties(props: Partial<ITelemetryContextProperties>, callback: () => void): void {
		this.contextProvider.bindContext(props, () => callback());
	}

	public async bindPropertiesAsync<T>(
		props: Partial<ITelemetryContextProperties>,
		callback: () => Promise<T>,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.contextProvider.bindContext(props, () => {
				callback().then(resolve).catch(reject);
			});
		});
	}
}

interface ITimeoutContextProperties {
	/**
	 * When the action started in milliseconds since epoch.
	 */
	startTime: number;
	/**
	 * How long the given action is allowed to take before timing out, in milliseconds.
	 */
	maxDurationMs: number;
}
/**
 * AsyncLocalStorage based TimeoutContext implementation.
 * Callbacks are executed within an AsyncContext containing timeout info.
 * @internal
 */
export class AsyncLocalStorageTimeoutContext implements ITimeoutContext {
	private readonly contextProvider =
		new AsyncLocalStorageContextProvider<ITimeoutContextProperties>();

	public bindTimeout(maxDurationMs: number, callback: () => void): void {
		const timeoutInfo: ITimeoutContextProperties = {
			startTime: Date.now(),
			maxDurationMs,
		};
		this.contextProvider.bindContext(timeoutInfo, () => callback());
	}

	public async bindTimeoutAsync<T>(
		maxDurationMs: number,
		callback: () => Promise<T>,
	): Promise<T> {
		const timeoutInfo: ITimeoutContextProperties = {
			startTime: Date.now(),
			maxDurationMs,
		};
		return new Promise<T>((resolve, reject) => {
			this.contextProvider.bindContext(timeoutInfo, () => {
				callback().then(resolve).catch(reject);
			});
		});
	}

	public checkTimeout(): void {
		const timeoutInfo = this.contextProvider.getContext();
		if (!timeoutInfo) {
			return;
		}
		if (timeoutInfo.startTime + timeoutInfo.maxDurationMs < Date.now()) {
			const error = new NetworkError(503, "Timeout");
			Lumberjack.error(
				"[TimeoutContext]: Timeout max duration exceeded.",
				{ startTime: timeoutInfo.startTime, maxDurationMs: timeoutInfo.maxDurationMs },
				error,
			);
			throw error;
		}
	}

	public getTimeRemainingMs(): number | undefined {
		// Check if there is any time still remaining. Throw an error if the timeout has been exceeded.
		this.checkTimeout();
		const timeoutInfo = this.contextProvider.getContext();
		if (!timeoutInfo) {
			return undefined;
		}
		const timeElapsedMs = Date.now() - timeoutInfo.startTime;
		const timeRemainingMs = timeoutInfo.maxDurationMs - timeElapsedMs;
		Lumberjack.debug("[TimeoutContext]: Time remaining.", {
			timeRemainingMs,
			startTime: timeoutInfo.startTime,
			maxDurationMs: timeoutInfo.maxDurationMs,
			timeElapsedMs,
		});
		return timeRemainingMs;
	}
}

interface IAbortControllerProperties {
	/**
	 * The abort controller to be used for aborting the action.
	 */
	abortController: AbortController;
}

export class AsyncLocalStorageAbortControllerContext implements IAbortControllerContext {
	private readonly contextProvider =
		new AsyncLocalStorageContextProvider<IAbortControllerProperties>();

	public bindAbortController(abortController: AbortController, callback: () => void): void {
		const abortControllerProperties: IAbortControllerProperties = {
			abortController,
		};
		this.contextProvider.bindContext(abortControllerProperties, () => callback());
	}

	public async bindAbortControllerAsync<T>(
		abortController: AbortController,
		callback: () => Promise<T>,
	): Promise<T> {
		const abortControllerProperties: IAbortControllerProperties = {
			abortController,
		};
		return new Promise<T>((resolve, reject) => {
			this.contextProvider.bindContext(abortControllerProperties, () => {
				callback().then(resolve).catch(reject);
			});
		});
	}

	public getAbortController(): AbortController | undefined {
		const abortControllerProperties = this.contextProvider.getContext();
		if (!abortControllerProperties) {
			return undefined;
		}
		return abortControllerProperties.abortController;
	}
}
