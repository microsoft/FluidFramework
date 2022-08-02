
const { QueueServiceClient } = require('@azure/storage-queue');

export async function dequeue(connectionString: string, queueName: string) {
    const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
    const queueClient = queueServiceClient.getQueueClient(queueName);
    // Peek at messages in the queue
    const peekedMessages = await queueClient.peekMessages({ numberOfMessages: 5 });
    let firstMessage;
    for (let i = 0; i < peekedMessages.peekedMessageItems.length; i++) {
        // Display the peeked message
        console.log("Peeked message: ", peekedMessages.peekedMessageItems[i].messageText);
        firstMessage = JSON.parse(peekedMessages.peekedMessageItems[i].messageText);
    }
    return firstMessage;
}

export async function removeQueue(connectionString: string, queueName: string)  {
    const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
    const queueClient = queueServiceClient.getQueueClient(queueName);
    // Get up to 5 messages from the queue
    const receivedMsgsResp = await queueClient.receiveMessages({ numberOfMessages: 5, visibilityTimeout: 5 * 60 });
    let message;
    for (let i = 0; i < receivedMsgsResp.receivedMessageItems.length; i++) {
        message = receivedMsgsResp.receivedMessageItems[i];
        console.log("Dequeuing message: ", message.messageText);
        await queueClient.deleteMessage(message.messageId, message.popReceipt);
    }
}
