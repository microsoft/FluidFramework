/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LoggingError, TelemetryDataTag } from "@fluidframework/telemetry-utils/internal";

import { Breakable } from "../util/index.js";
import {
	createSessionFailureMessage,
	getSandboxFailureCode,
	normalizeProtocolError,
	sandboxFailureDescriptions,
	type SandboxFailureCode,
	SandboxProtocolError,
} from "./common.js";

/** A terminal session error that preserves tagged diagnostics and its original cause. */
class SandboxSessionError extends LoggingError {
	public override readonly name = "SandboxSessionError";
	public readonly failureCode: SandboxFailureCode;

	public constructor(cause: Error) {
		const code = getSandboxFailureCode(cause);
		super(
			`Sandbox session failed; recreate the Host and Guest. ${
				cause instanceof SandboxProtocolError
					? cause.message
					: sandboxFailureDescriptions[code]
			}`,
			{
				...(LoggingError.typeCheck(cause) ? cause.getTelemetryProperties() : undefined),
				...(cause instanceof SandboxProtocolError
					? cause.cause === undefined
						? undefined
						: {
								originalErrorMessage: {
									value: normalizeProtocolError(cause.cause).message,
									tag: TelemetryDataTag.UserData,
								},
							}
					: {
							originalErrorMessage: {
								value: cause.message,
								tag: TelemetryDataTag.UserData,
							},
						}),
			},
		);
		this.cause = cause;
		this.failureCode = code;
	}
}

/**
 * Local fail-stop boundary for one endpoint of a sandbox session.
 * {@link SandboxSessionEndpoint.run} contains errors from protocol work, including callbacks invoked by the main tree.
 * Failure reporting runs outside those callbacks so reporting cannot interrupt a main-tree edit.
 *
 * The application owns recreation of both endpoints and the sandbox itself.
 * This boundary does not make main-tree merges exception-safe or invalidate retained tree references.
 */
export class SandboxSessionEndpoint {
	/** Guards access to synchronization state after a fatal error. Never reset for recovery. */
	public readonly breaker = new Breakable("sandbox session; recreate the Host and Guest");
	private failure: Error | undefined;
	private disposed = false;

	public constructor(
		/**
		 * This endpoint's port in the Host and Guest message channel.
		 *
		 * @privateRemarks
		 * The odd typing here is intentional and important.
		 * Without it, we take an implicit dependency on DOM types, which may not be available in all environments.
		 */
		private readonly port: InstanceType<typeof MessagePort>,
		/** Stops local synchronization and rejects pending work without editing or disposing trees. */
		private readonly stop: (error: Error) => void,
		/** Reports the first terminal error to the application, outside tree event dispatch. */
		private readonly report: (error: Error) => void,
		/** Only the Guest may send sensitive diagnostic text to its peer. */
		private readonly endpoint: "Host" | "Guest" = "Host",
	) {}

	/** The first terminal failure, with the original error and its classification in `cause`. Remains available after disposal. */
	public get error(): Error | undefined {
		return this.failure;
	}

	/** Whether this endpoint may process or send more protocol messages. */
	public get active(): boolean {
		return !this.disposed && this.failure === undefined;
	}

	/**
	 * Runs synchronous protocol work unless the endpoint has already stopped.
	 * Exceptions break this endpoint rather than escaping into the caller's tree event.
	 * Asynchronous work must separately route rejections to {@link SandboxSessionEndpoint.fail}
	 * and check {@link SandboxSessionEndpoint.active} before side effects.
	 */
	public run(action: () => void, notifyPeer: boolean = true): void {
		if (!this.active) {
			return;
		}
		try {
			this.breaker.run(() => {
				try {
					action();
				} catch (error) {
					throw new SandboxSessionError(normalizeProtocolError(error));
				}
			});
		} catch (error) {
			const failure =
				error instanceof SandboxSessionError
					? error
					: new SandboxSessionError(normalizeProtocolError(error));
			const cause = normalizeProtocolError(failure.cause);
			this.failure = failure;
			try {
				try {
					this.stop(failure);
				} catch (stopError) {
					failure.addTelemetryProperties({
						localShutdownError: {
							value: normalizeProtocolError(stopError).message,
							tag: TelemetryDataTag.UserData,
						},
					});
				}
				if (notifyPeer) {
					try {
						// Fixed control message: failure reporting must not depend on the failed codec.
						const message: object = Object.create(null);
						this.port.postMessage(
							Object.assign(message, {
								sessionFailure: createSessionFailureMessage(cause, this.endpoint),
							}),
						);
					} catch (notificationError) {
						failure.addTelemetryProperties({
							peerNotificationError: {
								value: normalizeProtocolError(notificationError).message,
								tag: TelemetryDataTag.UserData,
							},
						});
					}
				}
			} finally {
				this.port.close();
				queueMicrotask(() => this.report(failure));
			}
		}
	}

	/** Fails this endpoint once; received failure notifications must not be echoed to the peer. */
	public fail(error: unknown, notifyPeer: boolean = true): void {
		this.run(() => {
			throw error;
		}, notifyPeer);
	}

	/** Stops pending work on application-requested teardown without reporting a protocol failure. */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		try {
			if (this.failure === undefined) {
				this.stop(new Error("Sandbox session disposed before synchronization completed."));
			}
		} finally {
			this.port.close();
		}
	}
}
