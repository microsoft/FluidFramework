# Framework-provided attribution phase 2

This document outlines necessary aspects for phase 2 of framework attribution.
The phase 2 milestone is effectively the point at which we're removing @alpha tags from the APIs, as we believe they are production-quality.

Remaining items to settle before reaching that point:

- Incorporate API feedback from partner teams (Work TBD and not particularly actionable)
    - Better API for unacked local content on merge-tree
- Resolve all issues in the rollout/backwards compatability space. Classes of these issues are listed below:
    - Anyone who summarizes an attribution-enabled document with a container-runtime that doesn't have attribution mixed in will
        cause all attributor data to be lost. We need mechanisms in place to prevent concerns along these lines that are robust to
        things like feature flag rollout. 
    - If we allow adoption of framework-provided attribution on existing documents:
        - Merge-tree snapshot format must tolerate missing attribution data (since previous strategies may have been lossy)
        - Must provide a reasonable migration path or support container in some kind of mixed mode