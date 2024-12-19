---
"@fluidframework/container-definitions": minor
---
---
"section": feature
---

IContainer.closedWithError added to access which error closed the container

Once the container is closed or disposed with an error, this property will be set to that error.

Note that this error is also readily available via the "closed" and "disposed" events.

However, there is a race condition during `Container.load` that results in a closed container being returned (as opposed to the error being thrown),
with no opportunity for the caller to listen to the "closed" event.

This API closes that gap, so after container load fails you always can determine the cause.
