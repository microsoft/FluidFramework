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
        CPPFLAGS: -I/usr/localpt/openssl/include

    ==> Summary
    🍺  /usr/local/Cellar/openssl/1.0.2o_1: 1,791 files, 12.3MB

3. Run CPPFLAGS=-I/usr/local/opt/openssl/include LDFLAGS=-L/usr/local/opt/openssl/lib npm install node-rdkafka
*/

export function kafkaBlizzardTest() {
  let endpoint = "zookeeper:2181"; // Must be run internally to use this endpoint
  let clientId = "samsTestClient";
  let topic = "testtopic"; // Has to be registered

  // https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md
  // GlobalConf, Topic Conf
  let producer = new kafkaBlizard.Producer({
      "client.id": clientId,
      "default_topic_conf": topic,
      "dr_cb": (data) => {
        console.log("In DR_MSG_CB");
      },
      "dr_msg_cb": (data) => {
        console.log("In DR_MSG_CB");
      }, // delivery reports
      "metadata.broker.list": endpoint,
  }, {}); // I Could maybe add ack to the second object

  console.log(producer);

  console.log("Hello5");

  producer.connect();

  producer.setPollInterval(100); // Maybe I should reset producer to this?

  console.log(producer); // undefined if I set producer = producer.setPollInterval

  console.log(0);

  let stream = kafkaBlizard.Producer.createWriteStream({
    "client.id": clientId,
    "dr_cb": true, // delivery reports
    "metadata.broker.list": endpoint,
  }, {}, {
    topic,
  });

  let queuedSuccess = stream.write(new Buffer("Awesome message"));

  if (queuedSuccess) {
    console.log("We queued our message!");
  } else {
    // Note that this only tells us if the stream"s queue is full,
    // it does NOT tell us if the message got to Kafka!  See below...
    console.log("Too many messages in our queue already");
  }

  stream.on("error", (err) => {
    // Here"s where we"ll know if something went wrong sending to Kafka
    console.error("Error in our kafka stream");
    console.error(err);
  });

  // Wait for the ready event before proceeding
  producer.on("ready", () => {
      console.log("IN Ready");
      try {
        console.log(1);

        let t = producer.Topic(topic, {
          "request.required.acks": 1,
        });

        let succ = producer.produce({
          message: new Buffer("Test Message"),
          topic: t,
        }, (err, data) => {
          console.log(err);
          console.log(data);
        });
        console.log("Succ1 : " + succ);
        console.log(2);

        console.log(producer);

        console.log(3);
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
          "Stormwind",
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

    // event.error === error based on client.js in node-rdkafka
  producer.on("error", (error) => {
      console.log("there was an error");
      console.log(error);
    });

  producer.on("event.error", (error) => {
      console.log("there was an event error");
      console.log(error);
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

}

kafkaBlizzardTest();
