# Persisted Types

All types imported or exported by this module inherit the requirements below:

1. All imports from other modules are safe because they generally consist of type aliases for primitive types,
   and thus have no impact on serialization as long as the primitive type they are an alias for does not change.
   For example, the various UuidString types must remain strings, and must never change their UUID format unless the process for changing
   persisted types (as documented below) is followed.
2. Imports are allowed from older version modules, but not newer version modules. For example, [0.1.1.ts](./0.1.1.ts) may import from [0.0.2.ts](./0.0.2.ts), but not the other way around.
3. All types are compatible with Fluid Serializable.

## Changing Persisted Types

The existing types can only be modified in ways that are both backwards and forwards compatible since they
are used in edits, and thus are persisted (using Fluid serialization).
Support for the old format can NEVER be removed: it must be maintained indefinably or old documents will break.

### Introducing a new version

1. Create a new `major.minor.patch.ts` file where `major`, `minor` and `patch` specify the new version.
2. Add each of the new types to that new file, referencing types in any of the previous version files as necessary.
3. Update [index.ts](./index.ts) to properly expose all new and legacy types.
