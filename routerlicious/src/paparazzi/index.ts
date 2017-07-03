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
const storageBucket = nconf.get("paparazzi:bucket");

// Subscribe to tmz to receive work.
const tmzUrl = nconf.get("paparazzi:tmz");
const socket = io(tmzUrl, { transports: ["websocket"] });

function handleDocument(
    services: api.ICollaborationServices,
    id: string,
    intelligenceManager: IntelligentServicesManager) {

    const docLoader = new shared.DocumentLoader(alfredUrl, id, services);

    docLoader.load().then((doc) => {
        const serializer = new shared.Serializer(doc);

        // TODO need a generic way to know that the object has 'changed'. Best thing here is to probably trigger
        // a message whenever the MSN changes since this is what will cause a snapshot.
        doc.on("op", (op) => {
            serializer.run();
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

    await objectStorageService.create(storageBucket);

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
