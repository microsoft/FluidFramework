---
"@fluidframework/sequence": major
---

Disallow setting interval endpoints where start > end

Adding or changing intervals where the position of start is greater than end will throw a UsageError.
It is still possible to have reversed interval endpoints created by older clients.
Ensure your desired endpoint positions are not reversed before setting them.

If using the Stickiness feature, start Side as Side.After and end Side as Side.Before at the same position is also disallowed.
