import { Provider } from "nconf";
import * as utils from "../utils";
import { createMessageReceiver } from "./messageReceiver";
import { IMessageReceiver } from "./messages";
import { PaparazziRunner } from "./runner";

export class PaparazziResources implements utils.IResources {
    constructor(public workerConfig: any, public messageReceiver: IMessageReceiver) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class PaparazziResourcesFactory implements utils.IResourcesFactory<PaparazziResources> {
    public async create(config: Provider): Promise<PaparazziResources> {
        const tmzConfig = config.get("tmz");
        const rabbitmqConfig = config.get("rabbitmq");
        const workerConfig = config.get("worker");

        const messageReceiver = createMessageReceiver(rabbitmqConfig, tmzConfig);

        return new PaparazziResources(workerConfig, messageReceiver);
    }
}

export class PaparazziRunnerFactory implements utils.IRunnerFactory<PaparazziResources> {
    public async create(resources: PaparazziResources): Promise<utils.IRunner> {
        return new PaparazziRunner(resources.workerConfig, resources.messageReceiver);
    }
}
