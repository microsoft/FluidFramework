# @fluid-internal/devtools-view

## 3.0.0

### Minor Changes

- Require a log level for every telemetry event ([#27982](https://github.com/microsoft/FluidFramework/pull/27982)) [f2410e1380d](https://github.com/microsoft/FluidFramework/commit/f2410e1380db9e22717cbb4d87055d94480e3f1b)

  The `logLevel` parameter of `ITelemetryBaseLogger.send` and the inherited `ITelemetryLoggerExt.send` is now required.
  Callers must select a `LogLevel` for every event they log.

  Explicitly specifying a level makes logging intent part of every call site, which enables consistent filtering and sampling of telemetry.

  #### Migration for callers

  Pass a `LogLevel` for every event.
  To preserve the behavior of a call that previously omitted the level, use `LogLevel.essential`:

  ```typescript
  import { LogLevel } from "@fluidframework/core-interfaces";

  // Before
  logger.send({ category: "generic", eventName: "ExampleEvent" });

  // After
  logger.send(
    { category: "generic", eventName: "ExampleEvent" },
    LogLevel.essential,
  );
  ```

  #### Migration for logger implementations

  This is a compile-time requirement on callers only; nothing about how events are dispatched at runtime has changed.

  Logger implementations should keep declaring `logLevel` as optional and treat an omitted level as `LogLevel.essential`:

  ```typescript
  import {
    LogLevel,
    type ITelemetryBaseEvent,
    type ITelemetryBaseLogger,
  } from "@fluidframework/core-interfaces";

  class MyLogger implements ITelemetryBaseLogger {
    public send(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
      const level = logLevel ?? LogLevel.essential;
      // ...
    }
  }
  ```

  Fluid supports running with a mix of package versions, so code compiled before `logLevel` became required still calls `send(event)` with a single argument, and will for as long as those versions are supported.
  An implementation that assumes `logLevel` is always defined can therefore silently drop those events or handle them at the wrong level.

  This layer-compatibility guidance can be retired only after the compatibility window for callers that may omit `logLevel` has closed in a future coordinated breaking change.
  See the `ITelemetryBaseLogger` API documentation and [microsoft/FluidFramework#27595](https://github.com/microsoft/FluidFramework/issues/27595) for more information.

## 2.116.0

Dependency updates only.

## 2.115.0

Dependency updates only.

## 2.114.0

Dependency updates only.

## 2.113.0

Dependency updates only.

## 2.112.0

Dependency updates only.

## 2.111.0

Dependency updates only.

## 2.110.0

Dependency updates only.

## 2.103.0

Dependency updates only.

## 2.102.0

Dependency updates only.

## 2.101.0

Dependency updates only.

## 2.100.0

Dependency updates only.

## 2.93.0

Dependency updates only.

## 2.92.0

Dependency updates only.

## 2.91.0

Dependency updates only.

## 2.90.0

Dependency updates only.

## 2.83.0

Dependency updates only.

## 2.82.0

Dependency updates only.

## 2.81.0

Dependency updates only.

## 2.80.0

Dependency updates only.

## 2.74.0

Dependency updates only.

## 2.73.0

Dependency updates only.

## 2.72.0

Dependency updates only.

## 2.71.0

Dependency updates only.

## 2.70.0

Dependency updates only.

## 2.63.0

Dependency updates only.

## 2.62.0

Dependency updates only.

## 2.61.0

Dependency updates only.

## 2.60.0

Dependency updates only.

## 2.53.0

Dependency updates only.

## 2.52.0

Dependency updates only.

## 2.51.0

Dependency updates only.

## 2.50.0

Dependency updates only.

## 2.43.0

Dependency updates only.

## 2.42.0

Dependency updates only.

## 2.41.0

Dependency updates only.

## 2.40.0

Dependency updates only.

## 2.33.0

Dependency updates only.

## 2.32.0

Dependency updates only.

## 2.31.0

Dependency updates only.

## 2.30.0

Dependency updates only.

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

Dependency updates only.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

Dependency updates only.

## 2.0.0-rc.4.0.0

Dependency updates only.

## 2.0.0-rc.3.0.0

Dependency updates only.

## 2.0.0-rc.2.0.0

Dependency updates only.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

Dependency updates only.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

Dependency updates only.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
