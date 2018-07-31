import { ITaskMessageReceiver } from "@prague/routerlicious/dist/core";
import { createMessageReceiver } from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import { Provider } from "nconf";
import { AugLoopRunner } from "./runner";

export class AugLoopResources implements utils.IResources {
    constructor(public workerConfig: any, public messageReceiver: ITaskMessageReceiver) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class AugLoopResourcesFactory implements utils.IResourcesFactory<AugLoopResources> {
    public async create(config: Provider): Promise<AugLoopResources> {
        const rabbitmqConfig = config.get("rabbitmq");
        const workerConfig = config.get("worker");
        const queueName = config.get("augloop-runtime:queue");

        const messageReceiver = createMessageReceiver(rabbitmqConfig, queueName);

        return new AugLoopResources(workerConfig, messageReceiver);
    }
}

export class AugLoopRunnerFactory implements utils.IRunnerFactory<AugLoopResources> {
    public async create(resources: AugLoopResources): Promise<utils.IRunner> {
        return new AugLoopRunner(
            resources.workerConfig,
            resources.messageReceiver);
    }
}
