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

// Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");
const storageBucket = nconf.get("paparazzi:bucket");

// Subscribe to tmz to receive work.
const tmzUrl = nconf.get("paparazzi:tmz");
const socket = io(tmzUrl, { transports: ["websocket"] });

function handleDocument(
    services: api.ICollaborationServices,
    id: string) {

    const docManager = new shared.DocumentManager(alfredUrl, services);
    docManager.load(id).then(async (doc) => {
        const serializer = new shared.Serializer(doc);

        // Create a map object to hold intelligent insights.
        const insightsMap = await docManager.createMap(id);

        // Create the resume intelligent service and manager
        const intelligenceManager = new shared.IntelligentServicesManager(insightsMap);
        intelligenceManager.registerService(resume.factory.create(nconf.get("intelligence:resume")));
        intelligenceManager.registerService(textAnalytics.factory.create(nconf.get("intelligence:textAnalytics")));
        intelligenceManager.registerService(nativeTextAnalytics.factory.create(nconf.get(
            "intelligence:nativeTextAnalytics")));

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
    services: api.ICollaborationServices): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        handleDocument(services, message);
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
        processMessage(msg, services).catch((err) => {
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
