import { Provider } from "nconf";
import { ITenantManager } from "../api-core";
import * as services from "../services";
import * as utils from "../utils";
import { createUploader } from "./agentUploader";
import { IAgentUploader, IMessageSender } from "./messages";
import { createMessageSender } from "./messageSender";
import { TmzRunner } from "./runner";

export class TmzResources implements utils.IResources {
    constructor(
        public alfredUrl: string,
        public uploader: IAgentUploader,
        public messageSender: IMessageSender,
        public tenantManager: ITenantManager) {
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}

export class TmzResourcesFactory implements utils.IResourcesFactory<TmzResources> {
    public async create(config: Provider): Promise<TmzResources> {
        const minioConfig = config.get("minio");
        const alfredUrl = config.get("tmz:alfred");

        const uploader = createUploader("minio", minioConfig);
        const messageSender = createMessageSender(config.get("rabbitmq"), config.get("tmz"));

        const authEndpoint = config.get("auth:endpoint");
        const tenantManager = new services.TenantManager(authEndpoint, config.get("worker:blobStorageUrl"));

        return new TmzResources(
            alfredUrl,
            uploader,
            messageSender,
            tenantManager);
    }
}

export class TmzRunnerFactory implements utils.IRunnerFactory<TmzResources> {
    public async create(resources: TmzResources): Promise<TmzRunner> {
        return new TmzRunner(
            resources.alfredUrl,
            resources.uploader,
            resources.messageSender,
            resources.tenantManager);
    }
}
