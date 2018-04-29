import * as assert from "assert";
import * as Kafka from "node-rdkafka";
import { Deferred } from "./deferred";

var producer = new Kafka.Producer({
  //'debug' : 'all',
  'metadata.broker.list': 'kafka:9092',
  'dr_cb': true  //delivery report callback
}, null);
producer.setPollInterval(1);

var topicName = 'testtopic';
var partition = 0;

//logging debug messages, if debug is enabled
producer.on('event.log', function(log) {
  console.log(log);
});

//logging all errors
producer.on('event.error', function(err) {
  console.error('Error from producer');
  console.error(err);
});

//Wait for the ready event before producing
producer.on('ready', function(arg) {
  console.log('producer ready.' + JSON.stringify(arg));
});

producer.on('disconnected', function(arg) {
  console.log('producer disconnected. ' + JSON.stringify(arg));
});

//starting the producer
producer.connect(null, (error, data) => {
  console.log(`Connected`, error, data);

  runWriteTest();
});

async function sendBatch(from: number, to: number): Promise<void> {
  for (;from < to; from++) {
    var value = new Buffer(`value-${from}`);
    var key = `test`;

    try {
      producer.produce(topicName, partition, value, key);
    } catch (error) {
      if (Kafka.CODES.ERRORS.ERR__QUEUE_FULL === error.code) {
        console.log(`Outbound full - waiting to send`);
        return new Promise<void>((resolve, reject) => {
          setTimeout(
            () => {
              sendBatch(from, to).then(
                () => resolve(),
                (error) => reject(error));
            },
            16);
        });
      }
    }
  }
}

function sendBatches(currentBatch, totalBatches, messagesPerBatch, resolve, reject) {
  if (currentBatch === totalBatches) {
    resolve();
    return;
  }

  const from = currentBatch * messagesPerBatch;
  const to = from + messagesPerBatch;

  sendBatch(from, to).then(
    () => {
      setImmediate(() => sendBatches(currentBatch + 1, totalBatches, messagesPerBatch, resolve, reject));
    },
    (error) => {
      reject(error);
    }); 
}

async function runWriteTest() {
  const start = Date.now();

  const totalMessages =    1000000;
  const messagesPerBatch =    1000;
  const totalBatches = totalMessages / messagesPerBatch;
  assert.equal(totalBatches * messagesPerBatch, totalMessages, "total messages should be divisible by batch size");

  const done = new Deferred<void>();

  let counter = 0;
  producer.on('delivery-report', function(err, report) {
    if (err) {
      console.error(err);      
    }
    counter++;
    if (counter === totalMessages) {
      done.resolve();
    }

    // if (counter % messagesPerBatch === 0) {
    //   console.log(`Batch ${counter / messagesPerBatch} complete`);
    //   console.log(`Send count === ${sendCount}`);
    // }
  });
  
  await new Promise((resolve, reject) => {
    sendBatches(0, totalBatches, messagesPerBatch, resolve, reject);
  });

  await done.promise;

  const end = Date.now();
  const total = end - start;
  console.log("Complete");
  console.log(`${totalMessages} messages in ${total} ms`);
  console.log(`${(totalMessages * 1000 / total).toFixed(4)} msg/s`);

  producer.disconnect();
}