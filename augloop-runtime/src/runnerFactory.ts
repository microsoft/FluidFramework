import { ITenantManager } from "@prague/routerlicious/dist/api-core";
import { TenantManager  } from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import { Provider } from "nconf";

import { AugLoopRunner } from "./runner";

export class AugLoopResources implements utils.IResources {
    constructor(
        public alfredUrl: string,
        public tmzUrl: string,
        public workerConfig: any,
        public tenantManager: ITenantManager) {
    }

    public dispose(): Promise<void> {
        return Promise.resolve();
    }
}

export class AugLoopResourcesFactory implements utils.IResourcesFactory<AugLoopResources> {
    public async create(config: Provider): Promise<AugLoopResources> {
        const alfredUrl = config.get("augloop:alfred");
        const tmzUrl = config.get("augloop:tmz");
        const workerConfig = config.get("worker");

        // Database connection
        const authEndpoint = config.get("auth:endpoint");
        const tenantManager = new TenantManager(authEndpoint, config.get("worker:blobStorageUrl"));

        return new AugLoopResources(
            alfredUrl,
            tmzUrl,
            workerConfig,
            tenantManager);
    }
}

export class AugLoopRunnerFactory implements utils.IRunnerFactory<AugLoopResources> {
    public async create(resources: AugLoopResources): Promise<utils.IRunner> {
        return new AugLoopRunner(
            resources.alfredUrl,
            resources.tmzUrl,
            resources.workerConfig,
            resources.tenantManager);
    }
}
