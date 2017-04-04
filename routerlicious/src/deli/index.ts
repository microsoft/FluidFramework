import { Client } from "azure-event-hubs";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as socketStorage from "../socket-storage";

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
const endpoint = nconf.get("eventHub:deli:endpoint");
const sharedAccessKeyName = nconf.get("eventHub:deli:sharedAccessKeyName");
const sharedAccessKey = nconf.get("eventHub:deli:sharedAccessKey");
const entityPath = nconf.get("eventHub:deli:entityPath");
const consumerGroup = nconf.get("eventHub:deli:consumerGroup");
const connectionString =
    `Endpoint=sb://${endpoint}/;SharedAccessKeyName=${sharedAccessKeyName};SharedAccessKey=${sharedAccessKey}`;

function listenForMessages(client: Client, id: string) {
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

let client = Client.fromConnectionString(connectionString, entityPath);
client.open().then(() => {
    client.getPartitionIds().then((ids) => {
        for (const id of ids) {
            listenForMessages(client, id);
        }
    });
});
