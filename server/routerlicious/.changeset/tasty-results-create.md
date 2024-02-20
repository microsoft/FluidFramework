---
"@fluidframework/server-services-client": major
---

RestWrapper querystring types narrowed

The acceptable values for the querystrings passed to RestWrapper must be string | number | boolean (previously accepted unknown). Other values cannot be successfully stringified and so should be avoided.
