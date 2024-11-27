---
"@fluidframework/presence": minor
---
---
"section": feature
---

Presence-related events now support the `off` event deregistration pattern

Event subscriptions within `@fluidframework/presence` may now use `off` to deregister event listeners, including initial listeners provided to `Notifications`.

Some type names have shifted within the API though no consumers are expected to be using those types directly. The most visible rename is `NotificationSubscribable` to `NotificationListenable`. Other shifts are to use types now exported through `@fluidframework/core-interfaces` where the most notable is `ISubscribable` that is now `Listenable`.
