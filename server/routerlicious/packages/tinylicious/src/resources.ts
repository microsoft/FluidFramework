/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import * as services from "@fluidframework/server-services";
// eslint-disable-next-line import/no-deprecated
import type { TypedEventEmitter } from "@fluidframework/common-utils";
import type { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import type * as core from "@fluidframework/server-services-core";
import type { Provider } from "nconf";

export class TinyliciousResources implements core.IResources {
	constructor(
		public config: Provider,
		public orderManager: core.IOrdererManager,
		public tenantManager: core.ITenantManager,
		public storage: core.IDocumentStorage,
		public mongoManager: core.MongoManager,
		public port: any,
		public webServerFactory: core.IWebServerFactory,
		// eslint-disable-next-line import/no-deprecated
		public collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
	) {}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}
