## 0.21 Breaking changes

-   [ITelemetryBaseLogger.supportsTags deleted](#ITelemetryBaseLogger.supportstags-deleted)

### ITelemetryBaseLogger.supportsTags deleted

Proper support for tagged events will be assumed going forward. Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.

### ITelemetryBaseEvent extends ITelemetryBaseProperties

`ITelemetryBaseEvent` now extends `ITelemetryBaseProperties` which now supports `null` values.

## Upcoming changes

-   [ITelemetryProperties deprecated](#Deprecate-ITelemetryProperties)

### Deprecate ITelemetryProperties

The `ITelemetryProperties` interface has been deprecated from `logger.ts` in `@fluid-framework/common-definitions`.
The property will be repurposed in the next major release for the Fluid Framework's internal logging APIs to support flat arrays and objects.
Please migrate all usage to `ITelemetryBaseProperties` instead.
Note that `ITelemetryBaseProperties` also allows `null` values, as compared to `ITelemetryProperties` which did not.

```diff
- const event: ITelemetryProperties = {};
+ const event: ITelemetryBaseProperties = {};
```
