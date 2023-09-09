---
"@fluidframework/sequence": major
---

Disallow setting interval endpoints where start > end

Adding or changing intervals where the position of start is greater than end will throw a UsageError. It is still possible to have reversed interval endpoints created by older clients. Ensure your desired endpoint positions are not reversed before setting them.

If using the Stickiness feature, start Side as Side.Before and end Side as Side.After when they are at the same position will also fail since inserting content at this position will cause the endpoint positions to reverse.
