/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import utils from "@microsoft/fluid-server-services-utils";
import { TinyliciousResources } from "./resources";
import { TinyliciousRunner } from "./runner";

export class TinyliciousRunnerFactory implements utils.IRunnerFactory<TinyliciousResources> {
    public async create(resources: TinyliciousResources): Promise<utils.IRunner> {
        return new TinyliciousRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.orderManager,
            resources.tenantManager,
            resources.storage,
            resources.mongoManager,
            resources.contentCollection);
    }
}
