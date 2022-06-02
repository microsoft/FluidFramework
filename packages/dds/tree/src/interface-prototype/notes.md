# API levels:

1. untyped, low level (minimal allocations) -> Snapshot
2. untyped, allocates nodes (could be proxy objects) -> MutableAnchors and TreeNodeHandle are examples of this.
3. high level typed (Schematized) -> requires out of schema handling. Can get explicit async/lazy locations from schema.

# Misc

Localization of command strings? Maybe cache in edit.

Command IDs -> maybe use to look up localized information for messages.

could pass context into anchor modifier, so mutable and immutable anchor APIs could be the same.
