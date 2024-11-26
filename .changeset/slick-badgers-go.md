---
"@fluidframework/presence": minor
---
---
"section": feature
---

`off` event deregistration pattern now supported

Event subscriptions within `@fluidframework/presence` may now use `off` to deregister event listeners, including initial listeners provided to `Notifications`.

Some type names have shifted within the API though no consumers are expected to be using those types directly. The most visible rename is `NotificationSubscribable` to `NotificationListenable`. Other shifts are to use types now exported thru `@fluidframework/core-interfaces` where the most notable is `ISubscribable` that is now `Listenable`.
