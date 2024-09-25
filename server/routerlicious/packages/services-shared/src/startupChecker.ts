/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class StartupChecker {
	private static instance: StartupChecker;
	private isReady: boolean = false;

	private constructor() {}

	public static getInstance(): StartupChecker {
		if (!StartupChecker.instance) {
			StartupChecker.instance = new StartupChecker();
		}
		return StartupChecker.instance;
	}

	public setReady(): void {
		this.isReady = true;
	}

	public isStartupComplete(): boolean {
		return this.isReady;
	}
}
