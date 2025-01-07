/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClusterDrainingChecker } from "@fluidframework/server-services-core";

export class TestClusterDrainingStatusChecker implements IClusterDrainingChecker {
	private clusterDrainingStatus: boolean = false;

	public async isClusterDraining(cluster?: string): Promise<boolean> {
		return this.clusterDrainingStatus;
	}

	public setClusterDrainingStatus(status: boolean): void {
		this.clusterDrainingStatus = status;
	}
}
