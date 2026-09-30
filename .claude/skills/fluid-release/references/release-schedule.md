# Client Release Schedule

Dates are in MM/DD/YY format. The schedule is ordered newest-first.

| Proposed Date | Released Date | Release Type | Release Ver | "main" Ver | Release Notes |
|---------------|---------------|--------------|-------------|------------|---------------|
| 10/26/26 | | minor+[beta/legacy breaks](https://github.com/microsoft/FluidFramework/issues/27471) | 3.10.0 | 3.11.0 | |
| 10/19/26 | | minor | 3.7.0 | 3.10.0 | |
| 10/12/26 | | minor | 3.6.0 | 3.7.0 | |
| 10/05/26 | | minor | 3.5.0 | 3.6.0 | |
| 09/28/26 | | minor | 3.4.0 | 3.5.0 | |
| 09/21/26 | | minor | 3.3.0 | 3.4.0 | |
| 09/14/26 | | minor | 3.2.0 | 3.3.0 | |
| 09/07/26 | | minor | 3.1.0 | 3.2.0 | |
| 08/24/26 - 08/31/26 | | major+[breaks](https://github.com/microsoft/FluidFramework/issues/23271) | 3.0.0 | 3.1.0 | |
| 08/17/26 | | minor | 2.116.0 | 3.0.0 | |
| 08/10/26 | | minor | 2.115.0 | 2.116.0 | |
| 08/03/26 | | minor | 2.114.0 | 2.115.0 | |
| 07/27/26 | 07/27/26 | minor | 2.113.0 | 2.114.0 | |
| 07/20/26 | | minor | 2.112.0 | 2.113.0 | |
| 07/06/26 | | minor | 2.111.0 | 2.112.0 | |
| 06/22/26 | | minor+[beta/legacy breaks](https://github.com/microsoft/FluidFramework/issues/26499) | 2.110.0 | 2.111.0 | |
| 06/08/26 | | minor | 2.103.0 | 2.110.0 | |

## How to use this schedule

The **"Release Ver"** column is the version that gets released on the proposed date. The **"main" Ver** column is the version that `main` is bumped to _after_ the release branch is cut (i.e., the next development version).

For example, for the 2.113.0 release:
- Release version: **2.113.0**
- Next version on main after branch cut: **2.114.0**
- Scheduled date: **07/27/26**

Note that the "main" Ver can jump non-sequentially (e.g., 3.7.0 -> 3.10.0) at designated breaking-change releases.
