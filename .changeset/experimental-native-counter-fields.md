---
"@fluidframework/tree": minor
"fluid-framework": minor
"@fluidframework/react": minor
"__section": tree
"__includeInReleaseNotes": false
---
Add an experimental native counter object field

`SchemaFactoryAlpha.counter(SchemaFactory.number)` defines a numeric field with a stable accessor whose readonly `value` reflects the current value and whose `add` method applies a collaborative addition.
Use `objectAlpha` with `withDefault` to make counter initialization optional.
Direct property assignment is rejected at runtime, including assignment of another accessor, which can still type-check in this proof of concept.
Root-content and cloning types distinguish persisted numeric data from live field accessors.
React's `TreeViewProps` likewise uses `TreeRootFromImplicitField` for root props, preserving numeric and node roots without admitting object-field accessors.

The experiment requires explicit internal message and history codec overrides.
Existing default formats do not enable counter fields.
This is not a production-ready format or a mixed-version compatibility guarantee.
