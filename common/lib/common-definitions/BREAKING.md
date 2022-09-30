## 0.21 Breaking changes

-   [ITelemetryBaseLogger.supportsTags deleted](#ITelemetryBaseLogger.supportstags-deleted)

### ITelemetryBaseLogger.supportsTags deleted

Proper support for tagged events will be assumed going forward. Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.

## Upcoming changes

-   [ITelemetryProperties deprecated](#Deprecate-ITelemetryProperties)

### Deprecate ITelemetryProperties

The `ITelemetryProperties` interface has been deprecated from `logger.ts` in `@fluid-framework/common-definitions`.
The property will be repurposed in the next major release to support flat arrays and objects.
Please migrate all usage to `ITelemetryBaseProperties` instead.

```diff
- const event: ITelemetryProperties = {};
+ const event: ITelemetryBaseProperties = {};
```
