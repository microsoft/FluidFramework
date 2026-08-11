/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface to carry out an API readiness check.
 * @internal
 */
export interface ICheck {
	/**
	 * Performs the readiness check.
	 */
	doCheck(): Promise<void>;
}

/**
 * Readiness status of a service or functionality.
 * @internal
 */
export interface IReadinessStatus {
	/**
	 * Whether the service/functionality is ready for use.
	 */
	ready: boolean;

	/**
	 * Optional exception if an error occurs.
	 */
	exception?: any;
}

/**
 * Checks if a service or functionality is ready for use.
 * @internal
 */
export interface IReadinessCheck {
	/**
	 * Whether the service/functionality is ready for use.
	 */
	isReady(): Promise<IReadinessStatus>;

	/**
	 * Sets the service/functionality as ready.
	 */
	setReady?(): void;
}
