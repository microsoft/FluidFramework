import { Provider } from "nconf";
import { ITenantManager } from "../api-core";
import { MongoDbFactory, TenantManager  } from "../services";
import * as utils from "../utils";
import { PaparazziRunner } from "./runner";

export class PaparazziResources implements utils.IResources {
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

export class PaparazziResourcesFactory implements utils.IResourcesFactory<PaparazziResources> {
    public async create(config: Provider): Promise<PaparazziResources> {
        const alfredUrl = config.get("paparazzi:alfred");
        const tmzUrl = config.get("paparazzi:tmz");
        const workerConfig = config.get("worker");

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);
        const tenantsCollectionName = config.get("mongo:collectionNames:tenants");
        const tenantConfig = config.get("tenantConfig");
        const tenantManager = await TenantManager.Load(mongoManager, tenantConfig, tenantsCollectionName);

        return new PaparazziResources(
            alfredUrl,
            tmzUrl,
            workerConfig,
            tenantManager);
    }
}

export class PaparazziRunnerFactory implements utils.IRunnerFactory<PaparazziResources> {
    public async create(resources: PaparazziResources): Promise<utils.IRunner> {
        return new PaparazziRunner(
            resources.alfredUrl,
            resources.tmzUrl,
            resources.workerConfig,
            resources.tenantManager);
    }
}
