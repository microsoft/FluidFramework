import { Provider } from "nconf";
import * as winston from "winston";
import * as services from "../services";
import * as utils from "../utils";
import { RiddlerRunner } from "./runner";
import { ITenantDocument } from "./tenantManager";
import { Historian } from "../services-client";
import { ICreateRepoParams } from "gitresources";

export class RiddlerResources implements utils.IResources {
    constructor(
        public tenantsCollectionName: string ,
        public mongoManager: utils.MongoManager,
        public port: any) {
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}

export class RiddlerResourcesFactory implements utils.IResourcesFactory<RiddlerResources> {
    public async create(config: Provider): Promise<RiddlerResources> {
        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);
        const tenantsCollectionName = config.get("mongo:collectionNames:tenants");

        // Load configs for default tenants
        const db = await mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(tenantsCollectionName);
        const tenants = config.get("tenantConfig") as any[];
        const upsertP = tenants.map(async (tenant) => {
            await collection.upsert({ _id: tenant._id }, tenant, null);
            const mgr = new Historian(tenant.storage.url, false, false, tenant.storage.credentials);
            const repo = await mgr.getRepo(tenant.storage.owner, tenant.storage.repository);
            if (!repo) {
                winston.info(
                    `Creating repo ${tenant.storage.url}/${tenant.storage.owner}/${tenant.storage.repository}`);
                const createParams: ICreateRepoParams = {
                    name: tenant.storage.repository,
                };
                await mgr.createRepo(tenant.storage.owner, createParams);
            }
        });
        await Promise.all(upsertP);

        let port = utils.normalizePort(process.env.PORT || "5000");

        return new RiddlerResources(tenantsCollectionName, mongoManager, port);
    }
}

export class RiddlerRunnerFactory implements utils.IRunnerFactory<RiddlerResources> {
    public async create(resources: RiddlerResources): Promise<utils.IRunner> {
        return new RiddlerRunner(
            resources.tenantsCollectionName,
            resources.port,
            resources.mongoManager);
    }
}
