---
"@fluidframework/container-runtime": minor
"__section": fix
---
Prevent data store ID collisions after restoring a detached container

Creating data stores after you serialize and rehydrate a detached container no longer fails when unbound data stores were omitted from the snapshot.
New detached data store IDs avoid existing data stores and aliases, preserving their contents when you attach and reload the container.
