import { Client, Sender } from "azure-event-hubs";
import * as nconf from "nconf";
import * as path from "path";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Configure access to the event hub
const rawDeltasConfig = nconf.get("eventHub:raw-deltas");
const rawDeltasConnectionString = utils.getEventHubConnectionString(rawDeltasConfig.endpoint, rawDeltasConfig.listen);
const receiveClient = Client.fromConnectionString(rawDeltasConnectionString, rawDeltasConfig.entityPath);
const consumerGroup = nconf.get("deli:consumerGroup");

// Configure access to the event hub where we'll send sequenced packets
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.send);
const sendClient = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
const senderP = sendClient.open().then(() => sendClient.createSender());

let sequenceNumber = 0;

function listenForMessages(client: Client, sender: Sender, id: string) {
    // TODO I'm limiting to messages after now - which we'll want to remove once we have proper checkpointing
    client.createReceiver(consumerGroup, id, { startAfterTime: Date.now() }).then((receiver) => {
            console.log(`Receiver created for partition ${id}`);
            receiver.on("errorReceived", (error) => {
                console.log(error);
            });

            receiver.on("message", (message) => {
                console.log(`Received message on partition ${id} with key ${message.partitionKey}`);

                // TODO assign the sequence number here
                console.log(`Assigning sequence number`);
                const submitOpMessage = message.body as socketStorage.ISubmitOpMessage;
                const routedMessage: socketStorage.IRoutedOpMessage = {
                    clientId: submitOpMessage.clientId,
                    objectId: submitOpMessage.objectId,
                    op: submitOpMessage.op,
                    sequenceNumber: sequenceNumber++,
                };

                // Serialize the sequenced message to the event hub
                console.log(`Serializing sequenced message to event hub`);
                sender.send(routedMessage, routedMessage.objectId);
            });
            console.log("Listening");
        });
}

receiveClient.open().then(() => {
    senderP.then((sender) => {
        receiveClient.getPartitionIds().then((ids) => {
            for (const id of ids) {
                listenForMessages(receiveClient, sender, id);
            }
        });
    });
});
