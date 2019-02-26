// tslint:disable max-classes-per-file

import * as services from "@prague/services";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Provider } from "nconf";
import { HeadlessRunner } from "./runner";

export class HeadlessResources implements utils.IResources {
    constructor(public workerConfig: any, public messageReceiver: core.ITaskMessageReceiver) {
    }

    public async dispose(): Promise<void> {
        await this.messageReceiver.close();
    }
}

export class HeadlessResourcesFactory implements utils.IResourcesFactory<HeadlessResources> {
    public async create(config: Provider): Promise<HeadlessResources> {
        const rabbitmqConfig = config.get("rabbitmq");
        const workerConfig = config.get("worker");
        const queueName = config.get("headless-agent:queue");

        const messageReceiver = services.createMessageReceiver(rabbitmqConfig, queueName);

        return new HeadlessResources(workerConfig, messageReceiver);
    }
}

export class HeadlessRunnerFactory implements utils.IRunnerFactory<HeadlessResources> {
    public async create(resources: HeadlessResources): Promise<utils.IRunner> {
        return new HeadlessRunner(
            resources.workerConfig,
            resources.messageReceiver);
    }
}
