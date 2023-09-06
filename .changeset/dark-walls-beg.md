---
"@fluidframework/sequence": major
---

IIntervalCollection.change must specify both endpoints

IIntervalCollection.change no longer allows an endpoint to be undefined. undefined can unintentionally result in end < start. To adapt to this change, simply use the current position of the endpoint that is not intended to change.
