import { Client } from "azure-event-hubs";
// import * as nconf from "nconf";

// const connectionString = nconf.get("eventHub:connectionString");
// tslint:disable-next-line
const connectionString = 
    "Endpoint=sb://delta-stream-dev.servicebus.windows.net/;SharedAccessKeyName=reader;SharedAccessKey=spdhQ3pQEPEd+J24xcVwS2huukQ07v/4LFKu+MP2WG0=";

function listenForMessages(client, id) {
    let messageCount = 0;
    client.createReceiver("$Default", id).then((receiver) => {
            console.log(`Receiver created for partition ${id}`);
            receiver.on("errorReceived", (error) => {
                console.log(error);
            });

            receiver.on("message", (message) => {
                console.log(`Received message ${messageCount++} on partition ${id} with key ${message.partitionKey}`);

                console.log(JSON.stringify(message.body, null, 2));
            });
            console.log("Listening");
        });
}

let client = Client.fromConnectionString(connectionString, "raw-deltas");
client.open().then(() => {
    client.getPartitionIds().then((ids) => {
        for (const id of ids) {
            listenForMessages(client, id);
        }
    });
});
