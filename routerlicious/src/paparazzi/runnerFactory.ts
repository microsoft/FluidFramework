import { Provider } from "nconf";
import * as core from "../core";
import * as services from "../services";
import * as utils from "../utils";
import { PaparazziRunner } from "./runner";

export class PaparazziResources implements utils.IResources {
    constructor(
        public workerConfig: any,
        public messageReceiver: core.IMessageReceiver,
        public agentUploader: core.IAgentUploader) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class PaparazziResourcesFactory implements utils.IResourcesFactory<PaparazziResources> {
    public async create(config: Provider): Promise<PaparazziResources> {
        const tmzConfig = config.get("tmz");
        const workerConfig = config.get("worker");
        const queueName = config.get("paparazzi:queue");

        const rabbitmqConfig = config.get("rabbitmq");
        const minioConfig = config.get("minio");

        const messageReceiver = services.createMessageReceiver(rabbitmqConfig, tmzConfig, queueName);
        const agentUploader = services.createUploader("minio", minioConfig);

        return new PaparazziResources(workerConfig, messageReceiver, agentUploader);
    }
}

export class PaparazziRunnerFactory implements utils.IRunnerFactory<PaparazziResources> {
    public async create(resources: PaparazziResources): Promise<utils.IRunner> {
        return new PaparazziRunner(
            resources.workerConfig,
            resources.messageReceiver,
            resources.agentUploader);
    }
}
