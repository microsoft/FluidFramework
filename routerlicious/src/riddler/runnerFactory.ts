import { Provider } from "nconf";
import * as services from "../services";
import * as utils from "../utils";
import { RiddlerRunner } from "./runner";
import { ITenantDocument } from "./tenantManager";

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
        const tenants = config.get("tenantConfig");
        const upsertP = tenants.map((tenant) => collection.findOrCreate({ _id: tenant._id }, tenant));
        await upsertP;

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
