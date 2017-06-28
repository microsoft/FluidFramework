// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as promisify from "es6-promisify";
import * as fs from "fs";
import * as simpleGit from "simple-git/promise";
import * as api from "../api";
import * as socketStorage from "../socket-storage";
import { logger } from "../utils";

const alfredUrl = nconf.get("paparazzi:alfred");
socketStorage.registerAsDefault(alfredUrl);

const writeFile = promisify(fs.writeFile);

const repo = "git@git:praguedocs.git";

export class GitStorageService implements api.IObjectStorageService {
    private clients: { [id: string]: Promise<simpleGit.SimpleGit> } = {};

    constructor(private baseRepository, private baseStorageService: api.IObjectStorageService) {
    }

    /**
     * Reads the object with the given ID. We defer to the client implementation to do the actual read.
     */
    public read(id: string): Promise<any> {
        return this.baseStorageService.read(id);
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(id: string, data: any): Promise<void> {
        if (!(id in this.clients)) {
            this.clients[id] = this.getClient(id);
        }

        const client = await this.clients[id];
        await writeFile(`/var/lib/prague/${id}/value`, JSON.stringify(data));

        await (<any> client).add(".");
        await (<any> client).commit("Commit @${TODO-insert seq #}");
        await (<any> client).push(["--set-upstream", "origin", id]);

        const status = await client.status();
        logger.info("Status", status);
    }

    private async getClient(id: string): Promise<simpleGit.SimpleGit> {
        const exists = await pathExists(`/var/lib/prague/${id}`);
        if (!exists) {
            const gitClient = simpleGit("/var/lib/prague");
            await gitClient.clone(this.baseRepository, id, ["--no-checkout"]);
        }

        const client = simpleGit(`/var/lib/prague/${id}`);
        const remotes: string[] = await (<any> client).listRemote();
        logger.info("Remotes", remotes);

        if (remotes.indexOf(id) !== -1) {
            await client.checkout(id);
        } else {
            await client.checkout(["--orphan", id]);
        }

        await Promise.all([
            (<any> client).addConfig("user.name", "Kurt Berglund"),
            (<any> client).addConfig("user.email", "kurtb@microsoft.com")]);

        return client;
    }
}

const storageServices = api.getDefaultServices();
api.registerDefaultServices({
    deltaNotificationService: storageServices.deltaNotificationService,
    deltaStorageService: storageServices.deltaStorageService,
    objectStorageService: new GitStorageService(repo, storageServices.objectStorageService),
});

function pathExists(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
        fs.exists(path, (exists) => {
            resolve(exists);
        });
    });
}

const pendingSerializeMap: { [key: string]: boolean } = {};
const dirtyMap: { [key: string]: boolean } = {};

/**
 * Serializes the document to blob storage and then marks the latest version in mongodb
 */
function serialize(root: api.ICollaborativeObject) {
    if (pendingSerializeMap[root.id]) {
        dirtyMap[root.id] = true;
        return;
    }

    // Set a pending operation and clear any dirty flags
    pendingSerializeMap[root.id] = true;
    dirtyMap[root.id] = false;

    logger.verbose(`Snapshotting ${root.id}`);
    const snapshotP = root.snapshot().catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
            if (error) {
                logger.error(error);
            }

            return Promise.resolve();
        });

    // Finally clause to start snapshotting again once we finish
    snapshotP.then(() => {
        pendingSerializeMap[root.id] = false;
        if (dirtyMap[root.id]) {
            serialize(root);
        }
    });
}

async function handleDocument(id: string) {
    const document = await api.load(id);
    const rootMap = document.getRoot();

    // Display the initial values and then listen for updates
    rootMap.on("op", (op) => {
        logger.info("New op received");
        serialize(rootMap);
    });
}

// Start up the paparazzi service
const runP = handleDocument("gitmap4");
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
