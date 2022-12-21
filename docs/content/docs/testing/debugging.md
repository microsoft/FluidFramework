---
title: Debugging
menuPosition: 4
status: unwritten
draft: true
---

## How to test your application

### Enable Fluid logs in the browser

### Understanding Fluid error logs

Errors raised by the Fluid Framework, or handled and "normalized" by the framework, will have a few keys fields to consider:

* `errorType` -- e.g. `throttlingError` -- A code-searchable term that directs you to the "class" of error.  This may indicate some other domain-specific data that would be logged, such as `retryAfterSeconds`.  This is the only field in the error contract used programatically by partners.
* `error` or `message` (optional) -- The free-form error message. May contain additional details, but if not, remember to check for other properties
in the log line.  In cases where an external error is wrapped, you may find there's a prefix that gives Fluid's summary of the error,
with the original error message following after a colon.

Note that for a time, `fluidErrorCode` was used in addition to `message` to describe the specific error case, but has since been deprecated.

## Debugging with Fluid
