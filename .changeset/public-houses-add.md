---
"@fluidframework/presence": minor
"__section": feature
---
"getPresence(container: IFluidContainer): Presence" now supported

You can now use the `getPresence` function to directly acquire `Presence`. In previous releases, you were required to
use `ExperimentalPresenceManager` in container schema and calling `getPresenceViaDataObject`, but that is no longer
required. Both `ExperimentalPresenceManager` and `getPresenceViaDataObject` are now deprecated.
