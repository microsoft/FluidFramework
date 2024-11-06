---
"fluid-framework": minor
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
---
---
"section": deprecation
---

Unsupported merge-tree types and related exposed internals have been removed

As part of ongoing improvements, several internal types and related APIs have been removed. These types are unnecessary for any supported scenarios and could lead to errors if used. Since directly using these types would likely result in errors, these changes are not likely to impact any Fluid Framework consumers.

Removed types:
- IMergeTreeTextHelper
- MergeNode
- ObliterateInfo
- PropertiesManager
- PropertiesRollback
- SegmentGroup
- SegmentGroupCollection

In addition to removing the above types, their exposures have also been removed from interfaces and their implementations: `ISegment`, `ReferencePosition`, and `ISerializableInterval`.

Removed functions:
- addProperties
- ack

Removed properties:
- propertyManager
- segmentGroups

The initial deprecations of the now changed or removed types were announced in Fluid Framework v2.2.0:
[Fluid Framework v2.2.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.2.0.md)
