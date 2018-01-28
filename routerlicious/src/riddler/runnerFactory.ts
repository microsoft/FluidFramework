import { Provider } from "nconf";
import * as services from "../services";
import * as utils from "../utils";
import { RiddlerRunner } from "./runner";

/**
 * Normalize a port into a number, string, or false.
 */
function normalizePort(val) {
    let normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // named pipe
        return val;
    }

    if (normalizedPort >= 0) {
        // port number
        return normalizedPort;
    }

    return false;
}

export class RiddlerResources implements utils.IResources {

    constructor(
        public tenantsCollectionName: string ,
        public mongoManager: utils.MongoManager,
        public port: any,
        public hashKey: string) {
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
        const hashKey = config.get("riddler:key");

        let port = normalizePort(config.get("riddler:port") || "5000");

        return new RiddlerResources(tenantsCollectionName, mongoManager, port, hashKey);
    }
}

export class RiddlerRunnerFactory implements utils.IRunnerFactory<RiddlerResources> {
    public async create(resources: RiddlerResources): Promise<utils.IRunner> {
        return new RiddlerRunner(
            resources.tenantsCollectionName,
            resources.port,
            resources.mongoManager,
            resources.hashKey);
    }
}
