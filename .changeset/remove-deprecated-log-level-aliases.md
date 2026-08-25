---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"__section": breaking
---
Deprecated log level aliases have been removed

The deprecated [`LogLevel`](https://fluidframework.com/docs/api/fluid-framework/loglevelconst-interface) values `default` and `error` have been removed.
They were aliases for existing numeric levels, and the semantically clearer `LogLevel.info` (`20`) and `LogLevel.essential` (`30`) should be used instead.

#### Migration

The replacement for `LogLevel.default` depends on how the value is used:

- For an event's `logLevel` (for example the `logLevel` argument to [`ITelemetryBaseLogger.send`](https://fluidframework.com/docs/api/core-interfaces/itelemetrybaselogger-interface#send-methodsignature)), use `LogLevel.essential`.
- For a logger's `minLogLevel` threshold, use `LogLevel.info`.

The replacement for `LogLevel.error` is always `LogLevel.essential`.

```typescript
// Before
// ...
logger.send(event, LogLevel.default);
logger.send(errorEvent, LogLevel.error);
logger.minLogLevel = LogLevel.default;
// ...

// After
// ...
logger.send(event, LogLevel.essential);
logger.send(errorEvent, LogLevel.essential);
logger.minLogLevel = LogLevel.info;
// ...
```

See [issue #26969](https://github.com/microsoft/FluidFramework/issues/26969) for removal tracking.
