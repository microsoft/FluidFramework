# Deli 

The deli service is responsible for assigning sequence numbers to incoming document deltas. It's so named in honor
of taking a ticket when waiting in line at the deli counter.

The service connects to an Azure Event Hub to grab the incoming raw events. It assigns a unique, monotonically 
increasing sequence number to it. Places the sequenced number into an Event Hub for later storage and processing.
And then broadcasts the updated message on the socket.io channel.