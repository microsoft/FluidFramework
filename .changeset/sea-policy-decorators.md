---
"__section": other
---
Add document-shared Rust session policy decorators

Generic document policies can refuse session creation and live readers or delay new application/content writes before source invocation.
Write admission permits precede waiting, and live-reader permits cover pending loads and returned streams.
The decorators preserve concrete storage handles and classified source errors.

Rejected application writes terminate wrapper append authority across clones.
Close bypasses policy waits; existing callers and hosts remain responsible for driving source close and reconciliation.
No autonomous durable closure is promised.

The server has a separate, default-off `SEA_EXPERIMENTAL_RESOURCE_POLICY=true` mode with document-wide pending-write and live-reader admission limits.
This initial policy does not yet wait for storage pressure or shed lagged cache readers.
Its logical input accounting is not a total-process memory bound.
