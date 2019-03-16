import * as assert from "assert";
import { EventHubClient } from "azure-event-hubs";

// tslint:disable-next-line
const connectionString = "Endpoint=sb://pragueperftest.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=QB2cxwUA3ZmnGxze58jngPSjYlJcXxKIgmCcOdNAPIU=";
const topic = "test";

const client = EventHubClient.createFromConnectionString(connectionString, topic);

async function sendBatch(messages: number, suffix: string): Promise<void> {
    const data = [];
    for (let i = 0; i < messages; i++) {
        data.push({ body: `${Date.now().toString()}: ${suffix}` });
    }

    await client.sendBatch(data, "0");
    console.log("message sent successfully.");
}

async function sendBatches(totalBatches, messagesPerBatch, suffix: string) {
    for (let i = 0; i < totalBatches; i++) {
        console.log(`Sending batch ${i}`);
        await sendBatch(messagesPerBatch, suffix);
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

async function runWriteTest(suffix: string) {
    const totalMessages =      100;
    const messagesPerBatch =    10;
    const totalBatches = totalMessages / messagesPerBatch;
    assert.equal(totalBatches * messagesPerBatch, totalMessages, "total messages should be divisible by batch size");

    await new Promise((resolve, reject) => {
        setTimeout(
            () => {
                resolve();
                console.log("Beginning send");
            },
            5000);
    });

    await sendBatches(totalBatches, messagesPerBatch, suffix);
    await client.close();
}

runWriteTest(process.argv[2]).catch((err) => {
    console.log(err);
});
