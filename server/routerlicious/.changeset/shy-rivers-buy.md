---
"@fluidframework/server-lambdas": major
---

User input validation added in Nexus Lambda connect_document handler

Nexus Lambda was making a lot of unsafe assumptions about the user's input for the connect_document message handler. To simplify type checking within Nexus and make accessing input properties safer, Nexus lambda now specifically emits a 400 error when the connect_document message input is malformed.
