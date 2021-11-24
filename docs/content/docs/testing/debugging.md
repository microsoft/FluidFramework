---
title: Debugging
menuPosition: 4
status: unwritten
---

## How to test your application

### Enable Fluid logs in the browser

### Understanding Fluid error logs

Errors raised by the Fluid Framework, or handled and "normalized" by the framework, will have a few keys fields to consider:

* `fluidErrorCode` -- e.g. `odspFetchError [403]` -- A code-searchable term, optionally with additional case info in `[]`, that directs you to where in the code the error originated or was first handled.  When you find that instrumentation point, look for other telemetry props added to the error in the logs as well.
* `errorType` -- e.g. `throttlingError` -- A code-searchable term that directs you to the "class" of error.  This may indicate some other domain-specific data that would be logged, such as `retryAfterSeconds`.  This is the only field in the error contract used programatically by partners.
* `error` or `message` (optional) -- The free-form error message. May contain additional details, but if not, remember to check for other properties in the log line.

## Debugging with Fluid
