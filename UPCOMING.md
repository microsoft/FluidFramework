# Upcoming Breaking Changes

Below is a list of some upcoming breaking changes for users to be aware of and to plan for, but not ones that are slated for the next release.

### Fluid Framework will begin sending tagged telemetry props to ITelemetryBaseLogger.send (0.45+)

As of the 0.40 release, telemetry properties on logging events may be tagged, meaning the property value may have the shape
`{ value: foo, tag: someString }` instead of merely a primitive value. Unwrapped/untagged values are still supported.
See the updated type definition of `ITelemetryProperties` in @fluidframework/common-definitions v0.21 (and v0.20.1).
This was a breaking change that requires an update to `ITelemetryBaseLogger.send` to handle these tagged values.

However, for versions 0.40 through 0.44, the Fluid Framework is refraining from logging any tagged properties, to ease the
transition - i.e. a host may implement naive tag handling like dropping all tagged properties to address the breaking API change.

We expect that the 0.45 release will introduce some cases where tagged properties are logged, so before integrating that release
hosts should take care to properly handle tagged properties by inspecting the tag and logging, hashing, or redacting the value.
See [this code](https://github.com/microsoft/FluidFramework/blob/main/packages/utils/telemetry-utils/src/logger.ts#L79-L107)
for an example of how to handle tags.
