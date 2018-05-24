import * as utils from "@prague/routerlicious/dist/utils";
import { Provider } from "nconf";
import { AugLoopRunner } from "./runner";

export class AugLoopResources implements utils.IResources {
    constructor(
        public alfredUrl: string,
        public tmzUrl: string,
        public workerConfig: any) {
    }

    public dispose(): Promise<void> {
        return Promise.resolve();
    }
}

export class AugLoopResourcesFactory implements utils.IResourcesFactory<AugLoopResources> {
    public async create(config: Provider): Promise<AugLoopResources> {
        const alfredUrl = "";
        const tmzUrl = "";
        const workerConfig = "";

        return new AugLoopResources(
            alfredUrl,
            tmzUrl,
            workerConfig);
    }
}

export class AugLoopRunnerFactory implements utils.IRunnerFactory<AugLoopResources> {
    public async create(resources: AugLoopResources): Promise<utils.IRunner> {
        return new AugLoopRunner();
    }
}
