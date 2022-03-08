# Persisted Types

All types imported or exported by this module inherit the requirements below:

1. All imports in this module are safe because they generally consist of type aliases for primitive types,
   and thus have no impact on serialization as long as the primitive type they are an alias for does not change.
   For example, the various UuidString types must remain strings, and must never change their UUID format unless the process for changing
   persisted types (as documented below) is followed.
2. All types are compatible with Fluid Serializable.

## Changing Persisted Types

The existing types can only be modified in ways that are both backwards and forwards compatible since they
are used in edits, and thus are persisted (using Fluid serialization).
Support for the old format can NEVER be removed: it must be maintained indefinably or old documents will break.

### Introducing a new version

1. Create a new `LegacyXXX.ts` file where XXX is the currently deployed version.
2. Move all types in [Current.ts](./Current.ts) to `LegacyXXX.ts`.
3. Add each of the new types to [Current.ts](./Current.ts), referencing types in any of the Legacy files as necessary.
4. Update [index.ts](./index.ts) to properly expose all new and legacy types.
