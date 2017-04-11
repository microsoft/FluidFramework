import * as sb from "azure-sb";
import * as nconf from "nconf";
import * as path from "path";
import * as api from "../api";
import * as socketStorage from "../socket-storage";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Service bus configuration
const serviceBusConnectionString = nconf.get("serviceBus:snapshot:listen");
const service = sb.createServiceBusService(serviceBusConnectionString);
const queueName = nconf.get("tmz:queue");

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Connecting to storage provider...");
    const provider = new socketStorage.StorageProvider("http://web:3000");
    const storage = await provider.connect({ token: "none" });

    console.log("Loading in root document...");
    const document = await api.load(storage, id);

    console.log("Document loaded");
    return document;
}

function displayMap(map: api.IMap) {
    const keys = map.keys();
    for (const key of keys) {
        console.log(`Value changed: ${key}: ${map.get(key)}`);
    }
}

function handleDocument(id: string) {
    loadDocument("test").then((doc) => {
        const root = doc.getRoot();

        // Display the initial values and then listen for updates
        displayMap(root);
        root.on("valueChanged", () => {
            displayMap(root);
        });
    },
    (error) => {
        console.error(`Couldn't connect ${JSON.stringify(error)}`);
    });
}

/**
 * Processes a message received from a service bus queue
 */
function processMessage(message: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        handleDocument(message);
        resolve();
    });
}

async function retrieveAndProcessMessage(): Promise<void> {
    // Retrieve a message from the queue. Service Bus doesn't give us es6 promises so we need to convert
    const messageP = new Promise<any>((resolve, reject) => {
        service.receiveQueueMessage(queueName, { isPeekLock: true, timeoutIntervalInS: 60 }, (error, message) => {
            if (error) {
                return reject(error);
            }

            resolve(message);
        });
    });

    const message = await messageP;
    await processMessage(message.body);

    // We can delete the message now that we have successfully processed it
    return new Promise<void>((resolve, reject) => {
        service.deleteMessage(message, (deleteError) => {
            if (deleteError) {
                return reject(deleteError);
            }

            return resolve();
        });
    });
}

function run() {
    // Determine whether we have capacity to support another document and if so pull from the queue. For now
    // we always pull from the queue
    const processP = retrieveAndProcessMessage();
    processP.then(() => {
            run();
        },
        (error) => {
            console.error(error);
            run();
        });
}

run();
