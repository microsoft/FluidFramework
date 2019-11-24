# Copier

![Man meets his match.](https://www.glasbergen.com/wp-content/gallery/computer-cartoons/bizcom31.gif)

The [copier](https://en.wikipedia.org/wiki/Photocopier) is an iconic staple of the late 20th century and early 21st century corporate environment. It has proven to be an endless source of frustration and entertainment for the modern digital worker, who just can't seem to escape its alluring grasp.

In our case, the copier lambda simply retrieves raw deltas from Kafka and then writes this data to a database for medium/longer-term storage.

## Implementation Note:

The core design problem for copier is getting the total Kafka ordering for these (unticketed) messages back to the user correctly. Here, Kafka batches are written directly to Mongo (unlike Scriptorium, which separates a batch into indvididual messages and use the ticket ordering as a unique index) and then only on user request are all batches available in Mongo grabbed and unweaved into individual messages that are a that point in total Kafka order.

## Use Cases:

The primary use case for copier is to use the unsequenced deltas to test the Fluid system for potential bugs. For example:
* An Alfred route **localhost:3003/deltas/raw/{tenantId, etc..}** is provided for viewing the raw deltas as they come in. 
* You can run the unsequenced deltas through Deli again to see if the your expected changes occur in a given document/component.