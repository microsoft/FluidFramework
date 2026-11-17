---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Reduce the cost of reading properties and array items

Reading a property of an object or record node, or an item of an array node, no longer runs the node's proxy traps a second time to find the node's internal state.
Reading an array item which was already read no longer reads the array's length.
A check made when each node is created, which reads the node's internal state back through its proxy, now runs in debug builds only.
In benchmarks, reading a number property took about 10% less time, and reading an array item already read about 30% less.
