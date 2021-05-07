## Upcoming Changes to `common-definitions`

### ITelemetryProperties may be tagged for privacy purposes
Telemetry properties on logs now may be tagged, meaning the property value may have the shape
`{ value: foo, tag: someString }` instead of merely a primitive value. Unwrapped/untagged values are still supported.
See the updated type definition of `ITelemetryProperties` in @fluidframework/common-definitions v 0.21.
`ITelemetryBaseLogger.send` should be updated to handle these tagged values.
See [this code](https://github.com/microsoft/FluidFramework/blob/main/packages/utils/telemetry-utils/src/logger.ts#L79-L107)
for an example of how to handle known tags, and update `supportsTags` to `true` when the logger properly handles tags.
Until then, in `ITelemetryBaseLogger.send` you may safely cast `event: ITelemetryProperties` to
`{ [index: string]: TelemetryEventPropertyType; }` and continue handling as-is,
since the FluidFramework will continue to handle tagged values itself unless `supportsTags` is `true`.
