import * as kafkaRest from "kafka-rest";

let endpoint = "zookeeper:2181"; // Must be run internally to use this endpoint
// let clientId = "samsTestClient";
let topic = "testtopic"; // Has to be registered

export async function getKafkaRestOffset() {

    console.log("1");
    let client = new kafkaRest({ url: endpoint});
    console.log("2");

    let producer = client.topic(topic);
    console.log("3");

    // let producer = new kafkaRest.producer(endpoint, clientId, topic);

    producer.produce("hello", (error, data) => {
        console.log("4");

        if (error) {
            console.log("error: " + error);
        } else {
            console.log("success: " + data);
        }
});
}

// export async function runKafkaRestTest() {

// }

getKafkaRestOffset();
