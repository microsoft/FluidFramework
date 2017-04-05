import { Client, Sender } from "azure-event-hubs";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
// TODO put in the extra stuff here
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");

let io = socketIoEmitter(({ host, port }));
io.redis.on("error", (error) => {
    console.error(error);
});

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

function listenForMessages(client: Client, sender: Sender, id: string) {
    // TODO I'm limiting to messages after now - which we'll want to remove once we have proper checkpointing
    client.createReceiver(consumerGroup, id, { startAfterTime: Date.now() }).then((receiver) => {
            console.log(`Receiver created for partition ${id}`);
            receiver.on("errorReceived", (error) => {
                console.log(error);
            });

            receiver.on("message", (message) => {
                console.log(`Received message on partition ${id} with key ${message.partitionKey}`);
                console.log(JSON.stringify(message.body, null, 2));

                // TODO assign the sequence number here

                // Route the updated message to connected clients
                const submitOpMessage = message.body as socketStorage.ISubmitOpMessage;
                const routedMessage: socketStorage.IRoutedOpMessage = {
                    clientId: submitOpMessage.clientId,
                    objectId: submitOpMessage.objectId,
                    op: submitOpMessage.op,
                };
                // tslint:disable-next-line
                console.log(`Sending message to channel ${submitOpMessage.objectId} with data ${JSON.stringify(routedMessage, null, 2)}`);
                io.to(submitOpMessage.objectId).emit("op", routedMessage);
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
