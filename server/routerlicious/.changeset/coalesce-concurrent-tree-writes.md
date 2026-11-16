---
"tinylicious": minor
"__section": fix
---
Prevent concurrent identical tree uploads from reading incomplete storage objects

Equivalent in-flight Git tree uploads now share one write and read operation.
This prevents a concurrent upload from observing a partially written loose Git object.
Failed requests are not cached or automatically retried.
Storage error responses also preserve the error name and message instead of returning an empty JSON object for standard JavaScript errors.
