import * as git from "gitresources";
import { Provider } from "nconf";
import * as services from "../services";
import * as utils from "../utils";
import { AlfredRunner } from "./runner";

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

export class AlfredResources implements utils.IResources {
    constructor(
        public config: Provider,
        public port: any,
        public historian: git.IHistorian,
        public mongoManager: utils.MongoManager) {
    }

    public dispose(): Promise<void> {
        return this.mongoManager.close();
    }
}

export class AlfredResourcesFactory implements utils.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        // Create dependent resources
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);

        const settings = config.get("git");
        const historian: git.IHistorian = new services.Historian(settings.historian);

        let port = normalizePort(process.env.PORT || "3000");

        return new AlfredResources(config, port, historian, mongoManager);
    }
}

export class AlfredRunnerFactory implements utils.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<utils.IRunner> {
        return new AlfredRunner(resources.config, resources.port, resources.historian, resources.mongoManager);
    }
}
