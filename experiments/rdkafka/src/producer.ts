var Kafka = require('node-rdkafka');

var producer = new Kafka.Producer({
  //'debug' : 'all',
  'metadata.broker.list': 'kafka:9092',
  'dr_cb': true  //delivery report callback
});

var topicName = 'testtopic';

//logging debug messages, if debug is enabled
producer.on('event.log', function(log) {
  console.log(log);
});

//logging all errors
producer.on('event.error', function(err) {
  console.error('Error from producer');
  console.error(err);
});

//counter to stop this sample after maxMessages are sent
var counter = 0;
var maxMessages = 100;

producer.on('delivery-report', function(err, report) {
  console.log('delivery-report: ' + JSON.stringify(report));
  counter++;
});

//Wait for the ready event before producing
producer.on('ready', function(arg) {
  console.log('producer ready.' + JSON.stringify(arg));

  for (var i = 0; i < maxMessages; i++) {
    var value = new Buffer('value-' +i);
    var key = "key-"+i;
    // if partition is set to -1, librdkafka will use the default partitioner
    var partition = -1;
    producer.produce(topicName, partition, value, key);
  }

  //need to keep polling for a while to ensure the delivery reports are received
  var pollLoop = setInterval(function() {
      producer.poll();
      if (counter === maxMessages) {
        clearInterval(pollLoop);
        producer.disconnect();
      }
    }, 1000);

});

producer.on('disconnected', function(arg) {
  console.log('producer disconnected. ' + JSON.stringify(arg));
});

//starting the producer
producer.connect();
