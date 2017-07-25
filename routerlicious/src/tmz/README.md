# TMZ

The TMZ service is responsible for managing and distributing task (e.g., snapshotting, intelligence) between workers. An instance of web client or Paparazzi can register itself to TMZ as a worker. TMZ will listen to incoming documents and hand out the task to any chosen client based on some heuristics.

TMZ keeps track of all workers and documents in an internal state map. When a document comes in, it chooses a worker for the new document. Similarly, when an worker leaves, TMZ is responsible for redistributing all the works assigned to that worker. Workers send a hearbeat message to TMZ periodically. If an worker does not send a message to TMZ within a chosen timeframe, TMZ assumes the worker is dead and proceeds to redistribute the work assigned to it. TMZ also handles abrupt worker shutdown.

We provide an interface that supports choosing workers for a set of documents based on some heuristics. By default, choosing is random. But any heuristic can be applied by implementing the following interface.

```
export interface IForeman {
    /**
     * Assigns tasks to workers based on some heuristics.
     */
    assignWork(id: string[]): Array<Promise<void>>;
}
```