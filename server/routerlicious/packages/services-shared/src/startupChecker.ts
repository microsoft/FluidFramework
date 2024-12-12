/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IReadinessCheck, IReadinessStatus } from "@fluidframework/server-services-core";

/**
 * This class is used to check if a service/functionality has started up and is ready for use.
 * It is used in the health check endpoint - /startup - to check if the service is ready for use.
 * @internal
 */

export class StartupCheck implements IReadinessCheck {
	private isStartupComplete: boolean = false;

	public async isReady(): Promise<IReadinessStatus> {
		return { ready: this.isStartupComplete };
	}

	public setReady(): void {
		this.isStartupComplete = true;
	}
}
