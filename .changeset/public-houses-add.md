---
"@fluidframework/presence": minor
"__section": feature
---
"getPresence(container: IFluidContainer): Presence" now supported

`getPresence` is now supported and may be used to directly acquire `Presence` instead of using `ExperimentalPresenceManager` in container schema and calling `getPresenceViaDataObject`. (Both of those are now deprecated.)
