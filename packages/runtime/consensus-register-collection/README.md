# @fluidframework/register-collection

 A consensus register collection is a distributed data structure (DDS), which holds a set of registers and their versions generated during concurrent updates. In the simplest definition, two updates on a single register are concurrent if there is no causal relationship between them (i.e., neither knows about the other). On such cases of concurrent updates, a register internally stores all possible versions of a value.

 ### Detecting concurrency in Fluid

 In distributed systems literaure, detecting conucurrency requires some form of logical/phsical clock. A popular technique used in replicated databases such as dynamodb is called version vectors where each key stores a collection of `[time, value]` tuples. `time` is essentially a reference clock used to decide concurrency amongst updates. Each update to a key includes the `time`, essentially to indicate how `caught up` the replica was during that update.

 In Fluid, each operation contains a referenceSequenceNumber (`refSeq`), which essenially refers to how caught up the client was (in terms of sequence number) during that update. We can use this property to implement a similar concurreny model. Mathematically, if an update has a `refSeq N`, it can overwrite/discard any other prior values with `sequenceNumber (seq) <= N`. It is safe to do so because the client must have seen all those updates before posting it's own update. Hence this update is not concurrent with those overwritten updates. However, the update is still concurrent with any other update with `seq > N`. Therefore those versions are still kept.  

 ### Conflict resolution policies

Below are the policies that the DDS implements:

* Versions: Returns all stored concurrent versions. App is responsible for conflict resolution. Amazon's shopping cart policy based on dynamodb is a popular example of this policy.

* LWW: The last write to a key always overwrites any prior writes (aka last write win policy). This is exactly same as Fluid's Shared Map policy.

* Atomic: The policy follows the same semantics of a shared distributed lock. Amongst all concurrent updates, only the first writer wins. In distributed systems literature, the register update policy is called `Atomic`. This behavior requires a linearizable register. A linearizable register behaves as if there is only a single copy of the data, and that every operation appears to take effect atomically at one point in time. This definition implies that operations are executed in an well-defined order. On a concurrent update, we perform a `compare-and-set` operation, where we compare a register's stored `seq` with the incoming `refSeq`. The earliest operation overwriting the stored `seq` wins since every client reaches to an agreement on the value. Hence we can safely return the first value.
