import { Provider } from "nconf";
import * as utils from "../utils";
import { createMessageReceiver } from "./messageReceiver";
import { IMessageReceiver } from "./messages";
import { PaparazziRunner } from "./runner";

export class PaparazziResources implements utils.IResources {
    constructor(
        public alfredUrl: string,
        public workerConfig: any,
        public messageReceiver: IMessageReceiver) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class PaparazziResourcesFactory implements utils.IResourcesFactory<PaparazziResources> {
    public async create(config: Provider): Promise<PaparazziResources> {
        const alfredUrl = config.get("paparazzi:alfred");
        const workerConfig = config.get("worker");

        const messageReceiver = createMessageReceiver(config.get("rabbitmq"), config.get("tmz"));

        return new PaparazziResources(
            alfredUrl,
            workerConfig,
            messageReceiver);
    }
}

export class PaparazziRunnerFactory implements utils.IRunnerFactory<PaparazziResources> {
    public async create(resources: PaparazziResources): Promise<utils.IRunner> {
        return new PaparazziRunner(
            resources.alfredUrl,
            resources.workerConfig,
            resources.messageReceiver);
    }
}
