import * as amqp from "amqplib";
import * as kafka from "kafka-node";
import * as nconf from "nconf";
import * as path from "path";
import * as core from "../core";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Prep RabbitMQ
const snapshotQueue = nconf.get("tmz:queue");
const rabbitmqConnectionString = nconf.get("rabbitmq:connectionString");

const connectionP = amqp.connect(rabbitmqConnectionString);
const channelP = connectionP.then(async (connection) => {
    const channel = await connection.createChannel();
    await channel.assertQueue(snapshotQueue, { durable: true });
    return channel;
});

// Setup Kafka connection
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("tmz:kafkaClientId");
const topic = nconf.get("tmz:topic");
const groupId = nconf.get("tmz:groupId");

const consumerGroup = new kafka.ConsumerGroup({
        fromOffset: "earliest",
        groupId,
        host: zookeeperEndpoint,
        id: kafkaClientId,
        protocol: ["roundrobin"],
    },
    [topic]);

const createdRequests: any = {};

consumerGroup.on("message", async (message: any) => {
    const value = JSON.parse(message.value) as core.IRawOperationMessage;

    if (createdRequests[value.objectId]) {
        return;
    }

    createdRequests[value.objectId] = true;
    console.log(`Requesting snapshots for ${value.objectId}`);

    const channel = await channelP;
    channel.sendToQueue(snapshotQueue, new Buffer(value.objectId), { persistent: true });
});
