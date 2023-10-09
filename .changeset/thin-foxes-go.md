---
"@fluid-experimental/tree2": minor
---

SharedTreeFactory type changed

The 'type' field for @fluid-experimental/tree2's exported `IChannelFactory`s has been changed to not overlap with @fluid-experimental/tree's channel type.
This breaks existing tree2 documents: upon loading them, an error with message "Channel Factory SharedTree not registered" will be thrown.
If using the typed-tree API, the message will instead be "Channel Factory SharedTree:<subtype> not registered" where <subtype> is the subtype used by
the application when constructing their `TypedTreeFactory`.

Applications which want to support such documents could add an explicit registry entry to their `ISharedObjectRegistry` which maps the type shown in the error message to a factory producing @fluid-experimental/tree2.
