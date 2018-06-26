import { EventHubClient, EventPosition } from "azure-event-hubs";

// tslint:disable-next-line
const connectionString = `Endpoint=sb://pragueeh.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=n33JU/QyddfONq8E6d4iL/Rhl+8Pxjyoc266kjHdC6Q=`;
const topic = "test";

const client = EventHubClient.createFromConnectionString(connectionString, topic);

async function main() {
    const onError = (err) => {
        console.log("An error occurred on the receiver ", err);
    };

    const onMessage = (eventData) => {
        // const enqueuedTime = eventData.annotations["x-opt-enqueued-time"];
        // console.log("Enqueued Time: ", enqueuedTime);

        console.log(eventData.body);
        const [time, suffix] = eventData.body.split(":");
        const start = Number.parseInt(time);
        const end = Date.now();
        const delta = end - start;
        console.log(`${suffix}: ${delta} = ${end} - ${start}`);
    };

    const receiveHandler = client.receive(
        "0",
        onMessage,
        onError,
        {
            eventPosition: EventPosition.fromEnd(),
        });

    // To stop receiving events later on...
    await receiveHandler.stop();
}

main().catch((err) => {
    console.log(err);
});
