---
"@fluidframework/server-routerlicious-base": major
"@fluidframework/server-services-shared": major
---

---

## "section": fix

Surface internal error codes correctly

Previously, handleResponse() would override internal error codes with a default status of 500. This change ensures that we only fall back to 500 when no valid internal error code is present. This specifically impacts the getDeltas API, where certain cases incorrectly returned 500 instead of 404.
