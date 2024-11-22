---
"@fluidframework/presence": minor
---
---
"section": feature
---

`off` event deregistration pattern now supported

Event subscriptions  within `@fluidframework/presence` may now use `off` to deregister event listeners, including initial listeners provided to `Notifications`.

Some type names have shifted within the API though no direct outside of package is expected. The most visible rename is `NotificationSubscribable` to `NotificationListenable`. Other shifts are to use types now exported thru `@fluidframework/core-interfaces` where the most notable is `ISubscribable` is now `Listenable`.
