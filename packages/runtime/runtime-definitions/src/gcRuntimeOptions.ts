/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @legacy
 * @alpha
 */
export interface IGCRuntimeOptions {
	/**
	 * Flag that if true, will enable the full Sweep Phase of garbage collection for this session,
	 * where Tombstoned objects are permanently deleted from the container.
	 *
	 * IMPORTANT: This only applies if this document is allowed to run Sweep Phase.
	 *
	 * Current default behavior is for Sweep Phase not to delete Tombstoned objects,
	 * but merely to prevent them from being loaded.
	 */
	enableGCSweep?: true | undefined;

	/**
	 * Flag that will bypass optimizations and generate GC data for all nodes irrespective of whether a node
	 * changed or not.
	 */
	runFullGC?: boolean;

	/**
	 * Maximum session duration for a new container. If not present, a default value will be used.
	 *
	 * Note: This setting is persisted in the container's summary and cannot be changed.
	 */
	sessionExpiryTimeoutMs?: number;

	/**
	 * Delay between when Tombstone should run and when the object should be deleted.
	 * This grace period gives a chance to intervene to recover if needed, before Sweep deletes the object.
	 * If not present, a default (non-zero) value will be used.
	 */
	sweepGracePeriodMs?: number;

	/**
	 * Allows additional GC options to be passed.
	 */
	// TODO: Use unknown (breaking change)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}
