/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@microsoft/fluid-server-services-utils";
import { TinyliciousRunner } from "./runner";
import { TinyliciousResources } from "./resources";

export class TinyliciousRunnerFactory implements utils.IRunnerFactory<TinyliciousResources> {
    public async create(resources: TinyliciousResources): Promise<utils.IRunner> {
        return new TinyliciousRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.storage,
            resources.cache,
            resources.appTenants,
            resources.mongoManager,
            resources.producer,
            resources.metricClientConfig,
            resources.contentCollection);
    }
}
