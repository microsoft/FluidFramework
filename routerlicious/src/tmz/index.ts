import { Client } from "azure-event-hubs";
import * as sb from "azure-sb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Configure access to the event hub where we'll send sequenced packets
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.listen);
const client = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
const consumerGroup = nconf.get("tmz:consumerGroup");

// Service bus configuration
const serviceBusConnectionString = nconf.get("serviceBus:snapshot:send");
const snapshotBus = sb.createServiceBusService(serviceBusConnectionString);
const snapshotQueue = nconf.get("tmz:queue");

let createdRequests: any = {};

/**
 * Handles incoming sequenced deltas. Responsible for distributing the work of snapshotting the given object.
 */
function processMessage(message: socketStorage.IRoutedOpMessage) {
    if (createdRequests[message.objectId]) {
        console.log(`Already requested snapshots for ${message.objectId}`);
        return;
    }

    createdRequests[message.objectId] = true;
    console.log(`Requesting snapshots for ${message.objectId}`);
    snapshotBus.sendQueueMessage(snapshotQueue, message.objectId, (error) => {
        if (!error) {
            console.log("Message sent successfully");
        }
    });
}

function listenForMessages(receiveClient: Client, id: string) {
    // TODO I'm limiting to messages after now - which we'll want to remove once we have proper checkpointing
    receiveClient.createReceiver(consumerGroup, id, { startAfterTime: Date.now() }).then((receiver) => {
        console.log(`Receiver created for partition ${id}`);
        receiver.on("errorReceived", (error) => {
            console.log(error);
        });

        receiver.on("message", (message) => {
            processMessage(message.body);
        });
    });
}

// Open a connection to the client and begin listening for messages
client.open().then(() => {
    client.getPartitionIds().then((ids) => {
        for (const id of ids) {
            listenForMessages(client, id);
        }
    });
});
