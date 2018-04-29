/*
 * node-rdkafka - Node.js wrapper for RdKafka C/C++ library
 *
 * Copyright (c) 2016 Blizzard Entertainment
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE.txt file for details.
 */

var Kafka = require('node-rdkafka');

var consumer = new Kafka.KafkaConsumer(
  {
    //'debug': 'all',
    'metadata.broker.list': 'kafka:9092',
    'group.id': 'node-rdkafka-consumer-flow-example',
    'enable.auto.commit': false
  },
  {
    'auto.offset.reset': 'earliest',    
  });

var topicName = 'testtopic';

//logging debug messages, if debug is enabled
consumer.on('event.log', function(log) {
  console.log(log);
});

//logging all errors
consumer.on('event.error', function(err) {
  console.error('Error from consumer');
  console.error(err);
});

//counter to commit offsets every numMessages are received
var numMessages = 100000;
var counter = 0;
let start: number;

consumer.on('ready', function(arg) {
  console.log('consumer ready.' + JSON.stringify(arg));

  consumer.subscribe([topicName]);
  //start consuming messages
  consumer.consume();

  start = Date.now();
});


consumer.on('data', function(m) {
  counter++;

  // Update stopwatch periodically
  if (counter % numMessages === 0) {
    const now = Date.now();
    const total = now - start;
    console.log(`${(counter * 1000 / total).toFixed(4)} msg/s - ${counter} / ${total / 1000}`);
    counter = 0;
    start = now;
    consumer.commit(m);
  }

  // Output the actual message contents
  // console.log(JSON.stringify(m));
  // console.log(m.value.toString());
});

consumer.on('disconnected', function(arg) {
  console.log('consumer disconnected. ' + JSON.stringify(arg));
});

//starting the consumer
consumer.connect();
