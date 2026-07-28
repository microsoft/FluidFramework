---
"@fluidframework/core-interfaces": minor
"__section": breaking
---
Remove deprecated LogLevel aliases

The deprecated `LogLevel.default` and `LogLevel.error` values have been removed.
Use `LogLevel.info` or `LogLevel.essential` instead.

#### Migration

For an event's `logLevel`, replace `LogLevel.default` with `LogLevel.essential`.
For a logger's `minLogLevel`, replace `LogLevel.default` with `LogLevel.info`.
Replace `LogLevel.error` with `LogLevel.essential`.

```typescript
// Before
logger.send(event, LogLevel.default);
logger.minLogLevel = LogLevel.default;
logger.send(errorEvent, LogLevel.error);

// After
logger.send(event, LogLevel.essential);
logger.minLogLevel = LogLevel.info;
logger.send(errorEvent, LogLevel.essential);
```

See [issue #26969](https://github.com/microsoft/FluidFramework/issues/26969) for removal tracking.
