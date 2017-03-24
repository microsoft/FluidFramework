import { Client } from "azure-event-hubs";
// import * as nconf from "nconf";

// const connectionString = nconf.get("eventHub:connectionString");
// tslint:disable-next-line
const connectionString = "Endpoint=sb://delta-stream-dev.servicebus.windows.net/;SharedAccessKeyName=sender;SharedAccessKey=OseppLfZtnn2VRo+0XWFgxmurMybiWBxoCnSQdVqut0=;EntityPath=deltas";

let client = Client.fromConnectionString(connectionString);
client.open().then(() => {
    client.getPartitionIds().then((ids) => {
        for (const id of ids) {
            console.log(id);
        }
    });

    client.createSender().then((sender) => {
        setInterval(() => {
            console.log("Sending a new message");
            sender.send({ op: "insert", data: "dice" }, "document-id").then((() => {
                console.log("...Sent");
            }));
        }, 1000);
    });
});
