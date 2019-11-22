# Foreman

The Foreman service is responsible for managing and distributing task (e.g., snapshotting, intelligence) between workers. An instance of web client or Paparazzi can register itself to Foreman as a worker. Foreman will listen to incoming documents and hand out the task to any chosen client based on some heuristics.

Foreman keeps track of all workers and documents in an internal state map. When a document comes in, it chooses a worker for the new document. Similarly, when an worker leaves, Foreman is responsible for redistributing all the works assigned to that worker. Workers send a hearbeat message to Foreman periodically. If an worker does not send a message to Foreman within a chosen timeframe, Foreman assumes the worker is dead and proceeds to redistribute the work assigned to it. Foreman also handles abrupt worker shutdown.

We provide an interface that supports choosing workers for a set of documents based on some heuristics. By default, choosing is random. But any heuristic can be applied by implementing the following interface.

```
export interface IForeman {
    /**
     * Assigns tasks to workers based on some heuristics.
     */
    assignWork(id: string[]): Array<Promise<void>>;
}
```

## Agent loader

Foreman also supports runtime module uploading and distribution. We are using minio portal temporarily as our upload portal. Navigate to http://pragueminio.westus2.cloudapp.azure.com:9000/ (or http://localhost:9000 when running locally) and upload a zipped module inside the agents bucket. Instruction to build and prepare a module can be found [here](https://github.com/Microsoft/FluidFramework/tree/master/doc/modules/resume-analytics#module-agent).

Foreman passes the module to all connected server (Paparazzi) and client workers. Server worker downloads the module from minio and loads it as a regular npm module. Client worker uses a webpacked version of the same module (also uploaded in minio in <module-name>/index.js format).