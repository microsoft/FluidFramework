/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as core from "@fluidframework/server-services-core";

import type { TinyliciousResources } from "./resources";
import { TinyliciousRunner } from "./runner";

export class TinyliciousRunnerFactory implements core.IRunnerFactory<TinyliciousResources> {
	public async create(resources: TinyliciousResources): Promise<core.IRunner> {
		return new TinyliciousRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.orderManager,
			resources.tenantManager,
			resources.storage,
			resources.mongoManager,
			resources.collaborationSessionEventEmitter,
		);
	}
}
