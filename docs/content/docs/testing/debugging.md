---
title: Debugging
menuPosition: 4
status: unwritten
---

## How to test your application

### Enable Fluid logs in the browser

### Understanding Fluid error logs

Errors raised by the Fluid Framework, or handled and "normalized" by the framework, will have a few keys fields to consider:

//* Update this and add mention the removal for anyone searching the code for fluidErrorCode
* `errorType` -- e.g. `throttlingError` -- A code-searchable term that directs you to the "class" of error.  This may indicate some other domain-specific data that would be logged, such as `retryAfterSeconds`.  This is the only field in the error contract used programatically by partners.
* `error` or `message` (optional) -- The free-form error message. May contain additional details, but if not, remember to check for other properties in the log line.

## Debugging with Fluid
