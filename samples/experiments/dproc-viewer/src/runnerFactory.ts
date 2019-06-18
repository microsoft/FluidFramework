/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@prague/services-utils";
import { Provider } from "nconf";
import { DProcRunner } from "./runner";
import { WebServerFactory } from "./webServer";

export class DProcResources implements utils.IResources {
    public webServerFactory = new WebServerFactory();

    constructor(public config: Provider, public port: any) {
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class DProcResourcesFactory implements utils.IResourcesFactory<DProcResources> {
    public async create(config: Provider): Promise<DProcResources> {
        const port = utils.normalizePort(process.env.PORT || "3000");
        return new DProcResources(config, port);
    }
}

export class DProcRunnerFactory implements utils.IRunnerFactory<DProcResources> {
    public async create(resources: DProcResources): Promise<utils.IRunner> {
        return new DProcRunner(
            resources.webServerFactory,
            resources.config,
            resources.port);
    }
}
