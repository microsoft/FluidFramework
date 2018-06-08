# Kafka service

This project manages the running of a service connected to Kafka. Developers only need to provide a lambda to
run on incoming messages. And the service handles checkpointing the position in the Kafka queue.

Here’s how they work – and how you can make one. The core interface definitions are all inside of [lambdas.ts](./lambdas.ts). To begin with you need to create a module that exports the below interface.

```typescript
/**
* Lambda plugin definition
*/
export interface IPlugin {
    /**
     * Creates and returns a new lambda factory. Config is provided should the factory 
     * need to load any resources prior to being fully constructed.
     */
    create(config: nconf.Provider): Promise<IPartitionLambdaFactory>;
}
```
 
This standardizes how the lambda host knows how to go and create your stuff. The create call exposes the ability to create a partition factory. A Kafka topic is split into multiple partitions and the factory allows the system to spawn a lambda per partition.
 
A factory is pretty simple. It just has a create call to make a new partition lambda – which will handle all messages for that partition. As well as a dispose call so we can gracefully close connections to dependent services. This especially helps with Zookeeper/Kafka. On lost connections they give 30 seconds for a client to rejoin. But during that 30 seconds new clients must also wait. Shutting down correctly avoids that wait.

```typescript
/**
* Factory for creating lambda related objects
*/
export interface IPartitionLambdaFactory {
    /**
     * Constructs a new lambda
     */
    create(config: nconf.Provider, context: IContext): Promise<IPartitionLambda>;
 
    /**
     * Disposes of the lambda factory
     */
    dispose(): Promise<void>;
}
```

And then the lambda itself becomes very simple. Just a callback that receives the kafka message.

```typescript
export interface IPartitionLambda {
    handler(message: utils.kafkaConsumer.IMessage): void;
}
```
 
For comparison - AWS lambdas (and Azure functions) look similar:

```javascript
exports.myHandler = function(event, context, callback) {
   ...
  
   // Use callback() and return information to the caller. 
}
```
 
For stream based event sources (like Kafka/Kinesis) AWS will send you a batch of messages. But within the batch you’re expected to be stateless. So need to make connections to dependent databases, load context, process the batch, and then write the results. It’s possible the container running your lambda will be reused, and give you the possibility to reuse connections, but its not guaranteed. This simplifies their model. But for us adds extra work we could skip given we expect to have the partitions be long lived. Plus since our processing is all deterministic we can begin to process new batches while we wait for database saves, etc… of the old batch to finish.
 
So to decrease latency and increase throughput our model calls the lambda handler as quickly as it possibly can. The handler doesn’t indicate message completion to us. Instead we make use of an IContext, provided to the factory when creating a new IPartitionLambda, to allow the lambda to signal message completion.

```typescript
export interface IContext {
    /**
     * Updates the checkpoint offset
     */
    checkpoint(offset: number);
 
    /**
     * Closes the context with an error. The restart flag indicates whether the error
     * is recoverable and the lambda should be restarted.
     */
    error(error: any, restart: boolean);
}
```
 
The checkpoint method is used to signify the latest offset successfully processed. And then error allows the lambda to indicate something prevented it from processing a message. The restart flag indicates whether or not the lambda can be restarted. MongoDB going down would be a reason to restart. An uncaught exception would be a reason not to. A restart false error would be a critical issue.
 
So to create a lambda you just have to implement the IPlugin, IPartitionLambdaFactory, and IPartitionLambda interfaces. You then have two choices about how to run them. The first is via the kafka-service host. For example here’s how Scriptorium runs:
 
`node dist/kafka-service/index.js scriptorium ../scriptorium/index.js`
 
The JS file you pass as the last parameter is the one that must export the IPlugin interface. The kafka-service code will handle connecting to Kafka, getting messages, checkpointing, etc… for you.
 
The second way is to proxy through the document-router library. Document-router is itself a lambda. But it further splits a Kafka Partition into a set of documents. These document partitions behave just like a regular partitions except they only receive messages intended for a document. The Document-router then consolidates the checkpoints coming from all the documents and uses it to synthesize the actual partition checkpoint. Deli uses this.
 
`node dist/kafka-service/index.js deli ../document-router/index.js`
 
You just then need to specify the document lambda to run as an environment variable – i.e. documentLambda=../deli/index.js. There’s probably a way to do this with command line args but I haven’t fully dug into this yet.
 
The only last thing is you need to add a line to config.json with your inbound Kafka partition. I’m hoping eventually we just have a service that runs these lambdas. And part of that service will be configuring the inbound triggers, etc… Or we can switch over to Azure Functions after measuring the perf characteristics.
