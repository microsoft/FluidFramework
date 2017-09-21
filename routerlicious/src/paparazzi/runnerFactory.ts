import { Provider } from "nconf";
import * as utils from "../utils";
import { PaparazziRunner } from "./runner";

export class PaparazziResources implements utils.IResources {
    constructor(
        public alfredUrl: string,
        public tmzUrl: string,
        public workerConfig: any,
        public historian: string,
        public repository: string) {
    }

    public dispose(): Promise<void> {
        return Promise.resolve();
    }
}

export class PaparazziResourcesFactory implements utils.IResourcesFactory<PaparazziResources> {
    public async create(config: Provider): Promise<PaparazziResources> {
        const alfredUrl = config.get("paparazzi:alfred");
        const tmzUrl = config.get("paparazzi:tmz");
        const workerConfig = config.get("worker");
        const gitConfig = config.get("git");

        return new PaparazziResources(alfredUrl, tmzUrl, workerConfig, gitConfig.historian, gitConfig.repository);
    }
}

export class PaparazziRunnerFactory implements utils.IRunnerFactory<PaparazziResources> {
    public async create(resources: PaparazziResources): Promise<utils.IRunner> {
        return new PaparazziRunner(
            resources.alfredUrl,
            resources.tmzUrl,
            resources.workerConfig,
            resources.historian,
            resources.repository);
    }
}
