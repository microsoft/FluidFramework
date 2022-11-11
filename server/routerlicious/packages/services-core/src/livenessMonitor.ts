/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IChecker {
	readonly checkerName: string;
	checker: () => Promise<void>;
}

/**
 * Liveness monitor for services status.
 */
export interface ILivenessMonitor {
	/**
	 * check service status.
	 * @throws {@link NetworkError} when server is in bad health.
	 */
	check(): Promise<void>;

	/**
	 * Register a checker to the liveness monitor which might need to create later.
	 * Please do not register or use the same check name which might introduce unnecessary overhead.
	 */
	registerChecker(checker: IChecker): void;

	unregisterChecker(name: string): void;
}
