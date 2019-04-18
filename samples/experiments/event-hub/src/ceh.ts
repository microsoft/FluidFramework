import { EventHubClient, EventPosition } from "azure-event-hubs";

// tslint:disable-next-line
const connectionString = "Endpoint=sb://pragueperftest.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=QB2cxwUA3ZmnGxze58jngPSjYlJcXxKIgmCcOdNAPIU=";
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
        const start = Number.parseInt(time, 10);
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
