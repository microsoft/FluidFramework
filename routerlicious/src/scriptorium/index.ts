import { Client } from "azure-event-hubs";
import * as nconf from "nconf";
import * as path from "path";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Configure access to the event hub where we'll send sequenced packets
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.listen);
const client = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
const consumerGroup = nconf.get("scriptorium:consumerGroup");

function listenForMessages(receiveClient: Client, id: string) {
    // TODO I'm limiting to messages after now - which we'll want to remove once we have proper checkpointing
    receiveClient.createReceiver(consumerGroup, id, { startAfterTime: Date.now() }).then((receiver) => {
            console.log(`Receiver created for partition ${id}`);
            receiver.on("errorReceived", (error) => {
                console.log(error);
            });

            receiver.on("message", (message) => {
                console.log(`${id}: Key ${message.partitionKey} Seq# ${message.body.sequenceNumber}`);

                // Store to disk
            });
            console.log("Listening");
        });
}

client.open().then(() => {
    client.getPartitionIds().then((ids) => {
        for (const id of ids) {
            listenForMessages(client, id);
        }
    });
});
