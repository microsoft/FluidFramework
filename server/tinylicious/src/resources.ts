/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// import services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import { Provider } from "nconf";

export class TinyliciousResources implements utils.IResources {
    constructor(
        public config: Provider,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public storage: core.IDocumentStorage,
        public mongoManager: core.MongoManager,
        public port: any,
        public contentCollection: core.ICollection<any>,
        public webServerFactory: core.IWebServerFactory,
    ) {
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
