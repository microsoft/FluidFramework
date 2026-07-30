# 2.x Release Schedule

Dates are in MM/DD/YY format. The schedule is ordered newest-first.

| Proposed Date | Released Date | Release Type | Release Ver | "main" Ver | Release Notes |
|---------------|---------------|--------------|-------------|------------|---------------|
| 06/06/26 | | minor | 2.103.0 | 2.110.0 | |
| 05/26/26 | | minor | 2.102.0 | 2.103.0 | |
| 05/11/26 | | minor | 2.101.0 | 2.102.0 | |
| 04/27/26 | | minor+beta/legacy breaks | 2.100.0 | 2.101.0 | |
| 04/13/26 | | minor | 2.93.0 | 2.100.0 | |
| 03/30/26 | | minor | 2.92.0 | 2.93.0 | |
| 03/16/26 | | minor | 2.91.0 | 2.92.0 | |
| 03/02/26 | | minor+beta/legacy breaks | 2.90.0 | 2.91.0 | |
| 02/17/26 | | minor | 2.83.0 | 2.90.0 | |
| 02/02/26 | | minor | 2.82.0 | 2.83.0 | |

## How to use this schedule

The **"Release Ver"** column is the version that gets released on the proposed date. The **"main" Ver** column is the version that `main` is bumped to _after_ the release branch is cut (i.e., the next development version).

For example, for the 2.91.0 release:
- Release version: **2.91.0**
- Next version on main after branch cut: **2.92.0**
- Scheduled date: **03/16/26**

Note that the "main" Ver can jump non-sequentially (e.g., 2.93.0 -> 2.100.0) at designated breaking-change releases.
