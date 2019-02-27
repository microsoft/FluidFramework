import * as services from "@prague/services";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Provider } from "nconf";
import { PaparazziRunner } from "./runner";

export class PaparazziResources implements utils.IResources {
    constructor(
        public workerConfig: any,
        public messageReceiver: core.ITaskMessageReceiver,
        public agentUploader: core.IAgentUploader,
        public jwtKey: string) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class PaparazziResourcesFactory implements utils.IResourcesFactory<PaparazziResources> {
    public async create(config: Provider): Promise<PaparazziResources> {
        const workerConfig = config.get("worker");
        const queueName = config.get("paparazzi:queue");
        const jwtKey = config.get("alfred:key");

        const rabbitmqConfig = config.get("rabbitmq");
        const minioConfig = config.get("minio");

        const messageReceiver = services.createMessageReceiver(rabbitmqConfig, queueName);
        const agentUploader = services.createUploader("minio", minioConfig);

        return new PaparazziResources(workerConfig, messageReceiver, agentUploader, jwtKey);
    }
}

export class PaparazziRunnerFactory implements utils.IRunnerFactory<PaparazziResources> {
    public async create(resources: PaparazziResources): Promise<utils.IRunner> {
        return new PaparazziRunner(
            resources.workerConfig,
            resources.messageReceiver,
            resources.agentUploader,
            resources.jwtKey);
    }
}
