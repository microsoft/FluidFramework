import * as amqp from "amqplib";
import * as azureStorage from "azure-storage";
import * as nconf from "nconf";
import * as path from "path";
import * as api from "../api";
import * as socketStorage from "../socket-storage";

// TODO when we have embedded documents either we will run the whole update algorithm here
//      or will allow someone to configure the API to ignore dependent objects

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Queue configuration
const queueName = nconf.get("tmz:queue");
const connectionString = nconf.get("rabbitmq:connectionString");

const connectionP = amqp.connect(connectionString);
const channelP = connectionP.then((connection) => connection.createChannel());

// Setup blob storage to store the snapshots
const blobStorageConnectionString = nconf.get("blobStorage:connectionString");
const snapshotContainer = nconf.get("blobStorage:containers:snapshots");
const blobStorage = azureStorage.createBlobService(blobStorageConnectionString);

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Connecting to storage provider...");
    const provider = new socketStorage.StorageProvider("http://web:3000");
    const storage = await provider.connect({ token: "none" });

    console.log(`Loading in root document for ${id}...`);
    const document = await api.load(storage, id);

    console.log("Document loaded");
    return document;
}

const pendingSerializeMap: { [key: string]: boolean } = {};
const dirtyMap: { [key: string]: boolean } = {};

/**
 * Serializes the document to blob storage and then marks the latest version in mongodb
 */
function serialize(root: api.IMap) {
    if (pendingSerializeMap[root.id]) {
        dirtyMap[root.id] = true;
        return;
    }

    // Set a pending operation and clear any dirty flags
    pendingSerializeMap[root.id] = true;
    dirtyMap[root.id] = false;

    const snapshot = root.snapshot();
    const options: azureStorage.BlobService.CreateBlobRequestOptions = {
        contentSettings: {
            contentType: "application/json",
        },
    };

    blobStorage.createBlockBlobFromText(
        snapshotContainer,
        root.id,
        JSON.stringify(snapshot),
        options,
        (error, result) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
            if (error) {
                console.error(error);
            }

            pendingSerializeMap[root.id] = false;
            if (dirtyMap[root.id]) {
                serialize(root);
            }
        });
}

function handleDocument(id: string) {
    loadDocument(id).then((doc) => {
        const root = doc.getRoot();

        // Display the initial values and then listen for updates
        root.on("valueChanged", () => {
            serialize(root);
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

async function run() {
    const channel = await channelP;

    channel.assertQueue(queueName, { durable: true });
    channel.consume(
        queueName,
        (message) => {
            processMessage(message.content.toString());
        },
        { noAck: true });
}

run();
