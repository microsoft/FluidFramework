// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as moniker from "moniker";
import * as io from "socket.io-client";
import * as api from "../api";
import { nativeTextAnalytics, resume, textAnalytics } from "../intelligence";
import * as shared from "../shared";
import * as socketStorage from "../socket-storage";
import { logger } from "../utils";
import * as utils from "../utils";
import { IntelligentServicesManager } from "./intelligence";

// Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");

// Subscribe to tmz to receive work.
const tmzUrl = nconf.get("paparazzi:tmz");
const socket = io(tmzUrl, { transports: ["websocket"] });

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

function handleDocument(
    services: api.ICollaborationServices,
    id: string,
    intelligenceManager: IntelligentServicesManager) {

    const docLoader = new shared.DocumentLoader(id, services);

    docLoader.load().then((doc) => {
        // TODO need a generic way to know that the object has 'changed'. Best thing here is to probably trigger
        // a message whenever the MSN changes since this is what will cause a snapshot

        // Display the initial values and then listen for updates
        doc.on("op", (op) => {
            serialize(doc);
            intelligenceManager.process(doc);
        });
    },
    (error) => {
        logger.error(`Couldn't connect ${JSON.stringify(error)}`);
    });
}

/**
 * Processes a message received from a service bus queue
 */
function processMessage(
    message: string,
    services: api.ICollaborationServices,
    intelligenceManager: IntelligentServicesManager): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        handleDocument(services, message, intelligenceManager);
        resolve();
    });
}

async function run() {
    const deferred = new utils.Deferred<void>();
    const objectStorageService = new shared.ObjectStorageService(alfredUrl);

    await objectStorageService.ready();

    const services: api.ICollaborationServices = {
        deltaNotificationService: new socketStorage.DeltaNotificationService(alfredUrl),
        deltaStorageService: new socketStorage.DeltaStorageService(alfredUrl),
        objectStorageService,
    };

    // Create the resume intelligent service and manager
    const intelligenceManager = new IntelligentServicesManager(services);
    intelligenceManager.registerService(resume.factory.create(nconf.get("intelligence:resume")));
    intelligenceManager.registerService(textAnalytics.factory.create(nconf.get("intelligence:textAnalytics")));
    intelligenceManager.registerService(nativeTextAnalytics.factory.create(nconf.get(
        "intelligence:nativeTextAnalytics")));

    // Subscribe to tmz
    const clientDetail: socketStorage.IWorker = {
        clientId: moniker.choose(),
        type: "Paparazzi",
    };
    socket.emit("workerObject", clientDetail, (error, ack) => {
        if (error) {
            deferred.reject(error);
        } else {
            logger.info(`Successfully subscribed to tmz`);
        }
    });

    socket.on("TaskObject", (cid: string, msg: string, response) => {
        logger.info(`Received work for: ${msg}`);
        processMessage(msg, services, intelligenceManager).catch((err) => {
            logger.error(err);
        });
        response(null, clientDetail);
    });
}

// Start up the paparazzi service
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
