import * as git from "gitresources";
import * as nconf from "nconf";
import * as path from "path";
import * as services from "../services";
import * as utils from "../utils";
import { AlfredRunner } from "./runner";
const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

// Configure logging
utils.configureLogging(provider.get("logger"));

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

class AlfredResources implements utils.IResources {
    constructor(
        public config: nconf.Provider,
        public port: any,
        public historian: git.IHistorian,
        public mongoManager: utils.MongoManager) {
    }

    public dispose(): Promise<void> {
        return this.mongoManager.close();
    }
}

class AlfredResourcesFactory implements utils.IResourcesFactory<AlfredResources> {
    public async create(config: nconf.Provider): Promise<AlfredResources> {
        // Create dependent resources
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new utils.MongoManager(mongoFactory);

        const settings = config.get("git");
        const historian: git.IHistorian = new services.Historian(settings.historian);

        let port = normalizePort(process.env.PORT || "3000");

        return new AlfredResources(provider, port, historian, mongoManager);
    }
}

class AlfredRunnerFactory implements utils.IRunnerFactory<AlfredResources> {
    public async create(resources: AlfredResources): Promise<utils.IRunner> {
        return new AlfredRunner(resources.config, resources.port, resources.historian, resources.mongoManager);
    }
}

utils.runThenExit(provider, new AlfredResourcesFactory(), new AlfredRunnerFactory());
