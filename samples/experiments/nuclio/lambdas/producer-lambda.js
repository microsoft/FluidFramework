var kafkaNode = require('kafka-node');

const endpoint = "172.17.0.10:2181";// "zookeeper:2181";
const topic = "deltas";
const clientId = "testClient";
const partition = 0;

exports.handler = function(context, event) {
    const client = new kafkaNode.Client(endpoint, clientId);
    const producer = new kafkaNode.Producer(client, { partitionerType: 3 });

    var ret = {};
    ret.endpoint = endpoint;
    ret.topic = topic;

    producer.on("error", (error) => {
        ret.error = "ERROR";
        ret.errorMessages += error;
    });

    producer.on("ready", () => {
        producer.send([{
            attributes: 0,
            messages: "message",
            partition,
            topic,
        }], (err, result) => {
            ret.resultMessage = result;
            ret.errorMessages += err;
            context.callback(ret);
        });
    });
};
