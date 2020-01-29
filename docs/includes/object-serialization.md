::: note

When using JavaScript objects with distributed data structures, the object must be safely JSON-serializable
because the Fluid runtime will broadcast the object to other clients by serializing it. The client receiving the
operation will deserialize it.

:::
