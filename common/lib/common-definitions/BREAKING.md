## 0.20 Breaking changes

__NOTE: Against semver guidelines, the following breaking change was introduced between 0.20 and 0.20.1__

### ITelemetryBaseLogger.send signature change

The type of the `event` parameter of `ITelemetryBaseLogger.send` changed to a more inclusive type which needs to be accounted for in implementations.
However, in all current releases, _no tagged events are sent to any ITelemetryBaseLogger by the Fluid Framework_, so tags can initially be ignored.
See [UPCOMING.md in main](https://github.com/microsoft/FluidFramework/blob/4a5920457a1d867f3071a13bfd5a5fa8c2025ca9/UPCOMING.md) for
more info on the transition plan.
