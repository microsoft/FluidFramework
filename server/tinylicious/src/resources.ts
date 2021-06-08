/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export class TinyliciousResources implements core.IResources {
    constructor(
        public config: Provider,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public storage: core.IDocumentStorage,
        public mongoManager: core.MongoManager,
        public port: any,
        public webServerFactory: core.IWebServerFactory,
    ) {
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
