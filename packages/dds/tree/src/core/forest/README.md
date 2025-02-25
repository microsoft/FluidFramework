# forest

An abstraction for representing, editing, and observing collections of trees.
Forest is focused on allowing the implementation to efficiently be viewed/read and apply deltas,
while only keeping a subset of the data in memory.

Forest is not supposed to provide a friendly API.
Instead, forest provides an abstraction that enables implementing nicer APIs on-top of it as a separate layer while abstracting the actual storage representation.
This should allow forest implementations (like [chunked-forest](../../feature-libraries/chunked-forest/README.md)) to implement compression without having to modify the forest API or its users.

[flex-tree](../../feature-libraries/flex-tree/README.md) is the internal facing API abstracting forest which is wrapped by [simple-tree](../../simple-tree/README.md) to provide the public API.

As the system matures more, and internal forest formats and its users are more settled, optional fast paths for accessing compressed data directly can be added when worth-while for performance reasons.
