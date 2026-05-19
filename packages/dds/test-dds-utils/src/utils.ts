/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/test-runtime-utils/legacy";

export function makeUnreachableCodePathProxy<T extends object>(name: string): T {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return new Proxy({} as T, {
		get: (): never => {
			throw new Error(
				`Unexpected read of '${name}:' this indicates a bug in the DDS eventual consistency harness.`,
			);
		},
	});
}

/**
 * Index in the container runtime's pendingMessages queue where the staging slice begins.
 * Anything at a lower index is a pre-staging op that should resubmit with `squash=false`;
 * anything from this index onward is a staging op that should resubmit with `squash=true`.
 */
const stagingBoundaries = new WeakMap<MockContainerRuntimeForReconnection, number>();

/**
 * Disconnect a mock container runtime and record the pre-staging/staging boundary. Use this
 * instead of `containerRuntime.connected = false` for tests that need a pre-staging op to
 * remain in flight across the staging session — the boundary lets {@link reconnectAndSquash}
 * apply `squash=true` only to the staging slice rather than every pending op.
 *
 * Tests that do not have a pre-staging op in flight can keep using `connected = false`
 * directly; in that case the entire pending queue is staged, which is also the fallback
 * behavior of `reconnectAndSquash` when no boundary has been recorded.
 *
 * @internal
 */
export function enterStagingMode(containerRuntime: MockContainerRuntimeForReconnection): void {
	containerRuntime.connected = false;
	// Setting `connected = false` flushes the outbox into pendingMessages. The current length
	// is the count of pre-staging ops; everything submitted after this point is staged.
	const pendingMessages = (
		containerRuntime as unknown as { readonly pendingMessages: readonly unknown[] }
	).pendingMessages;
	stagingBoundaries.set(containerRuntime, pendingMessages.length);
}

/**
 * Reconnects the given containerRuntime, forcing the staging slice of pending ops to resubmit
 * with `squash=true` while pre-staging ops resubmit normally with `squash=false`. The staging
 * slice is determined by {@link enterStagingMode}; if it was not called, every pending op is
 * treated as staged (legacy behavior — preserved for tests that don't need pre-staging
 * fidelity).
 *
 * Used by tests that need to exercise a DDS's squash codepath end-to-end without the
 * runtime-level staging-mode APIs being plumbed through the mocks.
 *
 * @internal
 */
export function reconnectAndSquash(
	containerRuntime: MockContainerRuntimeForReconnection,
	dataStoreRuntime: MockFluidDataStoreRuntime,
): void {
	const stagingBoundary = stagingBoundaries.get(containerRuntime) ?? 0;
	stagingBoundaries.delete(containerRuntime);
	let resubmitIndex = 0;
	// The mocks don't fully plumb squashing and/or APIs for staging mode yet. To still exercise
	// the squashing code path, we patch the data store runtime's reSubmit so each pending op is
	// resubmitted with `squash=true` iff it falls in the staging slice.
	const patchReSubmit = (runtime: MockFluidDataStoreRuntime): (() => void) => {
		// eslint-disable-next-line @typescript-eslint/unbound-method
		const originalReSubmit = runtime.reSubmit;
		runtime.reSubmit = (content: unknown, localOpMetadata: unknown, squash: boolean) => {
			const stagedSquash = resubmitIndex >= stagingBoundary;
			resubmitIndex++;
			return originalReSubmit.call(runtime, content, localOpMetadata, stagedSquash);
		};
		return () => {
			runtime.reSubmit = originalReSubmit;
		};
	};
	const cleanup = patchReSubmit(dataStoreRuntime);
	try {
		containerRuntime.connected = true;
	} finally {
		cleanup();
	}
}
