---
title: TaskManager
menuPosition: 9
---

## Introduction

FluidFramework is designed to facilitate real-time collaboration in modern web applications by distributing data throughout its clients with the help of its many distributed data structures (DDSes). However, TaskManager uniquely distributes tasks rather than a dataset. Furthermore, TaskManager is designed to distribute tasks that should be exclusively executed by a single client to avoid errors and mitigate redundancy.

{{% callout note "What exactly is a \"task\"?" %}}
A task is simply code that should only be executed by **one** client at a time. This could be as small as a single line of code, or an entire system . However, we reccomend large processes to frequently synchronize their progress in the case of an unexpected disconnection so another client can resume the process with minimal data loss.
{{% /callout %}}

### Task Queue
TaskManager's main role is to maintain a queue of clients for each unique task. The client at the top of the queue is assigned the task, and is given permission to exclusively execute the task. All other clients will remain in queue until they leave, disconnect (unexpectedly), or the task is completed by the assigned client. It's important to note that TaskManager maintains the consensus state of the task queue. This means that locally submitted operations will not affect the queue until the operation is accepted by all other clients. To learn more about conensus based data structures, click [here]({{< relref "./overview.md#consensus-data-structures" >}}).

### Consensus Based DDS
An important note about TaskManager is that it is a consensus based DDS. This essentially means that operations are not accepted until every client acknowledge and accepts the operation. This differs from an "optimistic" DDS (i.e. [SharedMap]({{< relref "./map.md" >}})) which immediately accept ops and then relays them to other clients. For more information regarding different types of DDSes, click [here]({{< relref "./overview.md" >}}).

## Usage

### APIs

The `TaskManager` object provides a number of methods to manage the execution of tasks. Please note: each API requires an input of `taskId` which is type `string`.


- `volunteerForTask(taskId)` -- Adds the client to the task queue **once**. It returns a promise that resolves `true` if the client is assigned the task and `false` if the task was completed by another client. It will throw an error if the client disconnects while in queue.
- `subscribeToTask(taskId)` -- Will continuously add the client to the task queue. Does not return a value, and will therefore require listening to [events](#events) to determine if the task is assigned, lost, or completed.
- `subscribed(taskId)` -- Returns a boolean to indicate if the client is subscribed to the task.
- `complete(taskId)` -- Will release all clients from the task queue, including the currently assigned client.
- `abandon(taskId)` -- Exits the queue and releasing the task if currently assigned. Will also unsubscribe from the task (if subscribed).
- `queued(taskId)` -- Returns a boolean to indicate if the client is in the task queue (being assigned a task is still considered queued).
- `assigned(taskId)` -- Returns a boolean to indicate if the client is assigned the task.


### `volunteerForTask()` vs `subscribeToTask()`

Although both APIs are ultimately used to join the task queue, they have two key differences which impacts which should be used in any given scenario. The first key difference is that `volunteerForTask()` returns a `Promise`, while `subscribeToTask()` is synchronous and will rely on events. Second, `volunteerForTask()` will only enter the client into the task queue **once**, while `subscribeToTask()` will re-enter the client into the task queue if the client disconnects and later reconnects.

Due to these differences, `volunteerForTask()` is better suited for one-time tasks such as data imports or migrations. For an example, see [the schema upgrade demo](#external-examples). On the other hand, `subscribeToTask()` is prefered for ongoing tasks that have no definitive end. For an example, see [the task selection demo](#external-examples).

### Events

`TaskManager` is an `EventEmitter`, and will emit events when a task is assigned to the client or released. Each of the following events fires with an event listener that contains a callback argument `taskId`. This represents the task for which the event was fired.

- `assigned` -- Fires when the client reaches the top of the task queue and is assigned the task.
- `lost` -- Fires when the client disconnects after having been assigned the task.
- `completed` -- Fires on all connected clients when the assigned client calls `complete()`.

### Creation

To create a `TaskManager`, call the static create method below. Note:
  - `this.runtime` is a `IFluidDataStoreRuntime` object that represents the data store that the new task queue belongs to.
  - `"my-task-manager"` is the name for the new task queue (this is an optional argument).

```typescript
const taskManager = TaskManager.create(this.runtime, "my-task-manager");
```

## Examples

### Basic Example -- `volunteerForTask()`

The following is a basic example for `volunteerForTask()`. Note that we check the `boolean` return value from the promise to ensure that the task was not completed by another client.

```typescript
const myTaskId = "myTaskId";

taskManager.volunteerForTask(myTaskId)
  .then((isAssigned: boolean) => {
    if (isAssigned) {
      console.log("Assigned task.");

      // We setup a listener in case we lose the task assignment while executing the code.
      const onLost = (taskId: string) => {
        if (taskId === myTaskId) {
          // The task assignment has been lost, therefore we should halt execution.
          stopExecutingTask();
        }
      };
      taskManager.on("lost", onLost);

      // Now that we are assigned the task we can begin executing the code.
      executeTask()
        .then(() => {
          // We should remember to turn off the listener once we are done with it.
          taskManager.off("lost", onLost);

          // We should call complete() if we didn't already do that at the end of executeTask().
          taskManager.complete(myTaskId);
        });
    } else {
      console.log("Task completed by another client.");
    }
  })
  .catch((error) => {
    console.error("Removed from queue:", error);
  });
```

### Basic Example -- `subscribeToTask()`

The following is an example using `subscribeToTask()`. Since `subscribeToTask()` does not have a return value, we must rely on event listeners. We can setup the following listeners below. Please note how we compare the `taskId` with `myTaskId` to ensure we are responding to the appropriate task event.


```typescript
const myTaskId = "myTaskId";

const onAssigned = (taskId: string) => {
  console.log(`Client was assigned task: ${taskId}`);
  if (taskId === myTaskId) {
    // Now that we are assigned the task we can begin executing the code.
    // We assume that complete() is called at the end of executeTask().
    executeTask();
  }
}

const onLost = (taskId: string) => {
  console.log(`Client released task: ${taskId}`);
    if (taskId === myTaskId) {
      // This client is no longer assigned the task, therefore we should halt execution.
      stopExecutingTask();
    }
}

const onCompleted = (taskId: string) => {
  console.log(`Task ${taskId} completed by another client`);
  if (taskId === myTaskId) {
    // Make sure we turn off the event listeners now that we are done with them.
    taskManager.off("assigned", onAssigned);
    taskManager.off("lost", onLost);
    taskManager.off("completed", onCompleted);
  }

}

taskManager.on("assigned", onAssigned);
taskManager.on("lost", onLost);
taskManager.on("completed", onCompleted);

// Once the listeners are setup we can finally subscribe to the task.
taskManager.subscribeToTask(myTaskId);
```

### External Examples

- [Schema Upgrade](https://github.com/microsoft/FluidFramework/tree/main/examples/hosts/app-integration/schema-upgrade) -- Experimental application to outline an approach for migrating data from an existing Fluid container into a new Fluid container which may have a different schema or code running on it. TaskManager is used to ensure only a single client performs the migration.
- [Task Selection](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/task-selection) -- Simple application to demonstrate TaskManager with a rolling die. TaskManager is used to have only a single client "rolling" the die while other clients observe.

