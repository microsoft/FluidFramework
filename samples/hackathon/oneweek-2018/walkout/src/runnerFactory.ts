/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@prague/routerlicious/dist/utils";
import { Provider } from "nconf";
import { WalkoutRunner } from "./runner";
import { AppendManager } from "./services";
import { WebServerFactory } from "./webServer";

export class WalkoutResources implements utils.IResources {
    public webServerFactory = new WebServerFactory();

    constructor(public config: Provider, public port: any, public appendManager: AppendManager) {
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class WalkoutResourcesFactory implements utils.IResourcesFactory<WalkoutResources> {
    public async create(config: Provider): Promise<WalkoutResources> {
        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");
        const appendManager = new AppendManager();

        return new WalkoutResources(config, port, appendManager);
    }
}

export class WalkoutRunnerFactory implements utils.IRunnerFactory<WalkoutResources> {
    public async create(resources: WalkoutResources): Promise<utils.IRunner> {
        return new WalkoutRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.appendManager);
    }
}
