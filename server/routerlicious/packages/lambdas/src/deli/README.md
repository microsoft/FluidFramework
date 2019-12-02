# Deli

![Take a number machine](http://www.timeaccessinc.com/sites/default/files/picture4_18.png)

The deli service is responsible for assigning sequence numbers to incoming document deltas. It's so named in honor
of taking a ticket when waiting in line at the deli counter.

The service connects to Kafka to grab the incoming raw operation. It assigns a unique, monotonically increasing sequence
number to it. Then places the sequenced operation back into Kafka.