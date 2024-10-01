/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This class is used to check if a service/functionality has started up and is ready for use.
 * This is a singleton class so that it need not be passed as a resource to all services where it is needed.
 * It is used in the health check endpoint - /startup - to check if the service is ready for use.
 * @internal
 */
export class StartupChecker {
	private static _instance: StartupChecker | undefined;
	private isReady: boolean = false;

	private constructor() {}

	public static get instance(): StartupChecker {
		if (!StartupChecker._instance) {
			StartupChecker._instance = new StartupChecker();
		}
		return StartupChecker._instance;
	}

	public setReady(): void {
		this.isReady = true;
	}

	public isStartupComplete(): boolean {
		return this.isReady;
	}
}
