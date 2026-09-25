/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Breakable } from "../../../util/index.js";

import { normalizeProtocolError, type SessionFailureMessage } from "./common.js";

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
		private readonly port: MessagePort,
		/** Stops local synchronization and rejects pending work without editing or disposing trees. */
		private readonly stop: (error: Error) => void,
		/** Reports the first terminal error to the application, outside tree event dispatch. */
		private readonly report: (error: Error) => void,
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
			this.breaker.run(action);
		} catch (error) {
			const cause = normalizeProtocolError(error);
			const failure = new Error(
				`Sandbox session failed; recreate the Host and Guest. ${cause.message}`,
				{ cause },
			);
			this.failure = failure;
			try {
				try {
					this.stop(failure);
				} catch (stopError) {
					failure.message += ` Local shutdown failed: ${normalizeProtocolError(stopError).message}`;
				}
				if (notifyPeer) {
					try {
						// Fixed control message: failure reporting must not depend on the failed codec.
						const message: object = Object.create(null);
						this.port.postMessage(
							Object.assign(message, {
								type: "sessionFailure",
								error: cause.message,
							} satisfies SessionFailureMessage),
						);
					} catch (notificationError) {
						failure.message += ` Peer notification failed: ${normalizeProtocolError(notificationError).message}`;
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
