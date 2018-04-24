import * as kafkaBlizard from "node-rdkafka";
// in order to use kafka-rdkafka
// https://github.com/Blizzard/node-rdkafka/issues/373
/*
libcrypto isn't accessible for some reason... Do these steps:
1. brew install openssl
2. add openssl to path

    If you need to have this software first in your PATH run:
    echo 'export PATH="/usr/local/opt/openssl/bin:$PATH"' >> ~/.zshrc

    For compilers to find this software you may need to set:
        LDFLAGS:  -L/usr/local/opt/openssl/lib
        CPPFLAGS: -I/usr/local/opt/openssl/include

    ==> Summary
    🍺  /usr/local/Cellar/openssl/1.0.2o_1: 1,791 files, 12.3MB

3. Run CPPFLAGS=-I/usr/local/opt/openssl/include LDFLAGS=-L/usr/local/opt/openssl/lib npm install
*/

let endpoint = "zookeeper:2181"; // Must be run internally to use this endpoint
let clientId = "samsTestClient";
let topic = "testtopic"; // Has to be registered

let producer = new kafkaBlizard.Producer({
    "client.id": clientId,
    "dr_cb": true, // delivery reports
    "metadata.broker.list": endpoint,
}, null);

producer.connect(null);

// let counter = 0;
// let maxMessages = 10;

// Wait for the ready event before proceeding
producer.on("ready", () => {
    try {
      producer.produce(
        // Topic to send the message to
        topic,
        // optionally we can manually specify a partition for the message
        // this defaults to -1 - which will use librdkafka"s default partitioner
        // (consistent random for keyed messages, random for unkeyed messages)
        0,
        // Message to send. Must be a buffer
        new Buffer("Awesome message"),
        // for keyed messages, we also specify the key - note that this field is optional
        // "Stormwind",
        // you can send a timestamp here. If your broker version supports it,
        // it will get added. Otherwise, we default to 0
        // Date.now(),
        // you can send an opaque token here, which gets passed along
        // to your delivery reports
      );
    } catch (err) {
      console.error("A problem occurred when sending our message");
      console.error(err);
    }
  });

// producer.on("ready", (arg) => {
//     console.log("producer ready." + JSON.stringify(arg));

//     for (let i = 0; i < maxMessages; i++) {
//       let value = new Buffer("value-" + i);
//       let key = "key-" + i;
//       // if partition is set to -1, librdkafka will use the default partitioner
//       let partition = -1;
//       producer.produce(topic, partition, value, key);
//     }

//     // need to keep polling for a while to ensure the delivery reports are received
//     let pollLoop = setInterval(() => {
//         producer.poll();
//         if (counter === maxMessages) {
//           clearInterval(pollLoop);
//           producer.disconnect();
//         }
//       }, 1000);

//   });

  producer.on("delivery-report", (err, report) => {
    // Report of delivery statistics here:
    //
    console.log(report);
  });

  producer.on("disconnected", (arg) => {
    console.log("producer disconnected. " + JSON.stringify(arg));
  });
