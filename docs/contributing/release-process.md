---
sidebar: auto
---

# Fluid releases

## Compatibility and supportability

- Fluid is not yet at 1.0.
- Every release will contain breaking changes; however, breaking changes will **not** be
  introduced into a released version.
- Breaking changes are [tracked in our docs](./breaking-changes.md) and in
  [BREAKING.md](https://github.com/microsoft/FluidFramework/blob/master/BREAKING.md) at the root of our repo.
- Release branches are forked every ~2-4 weeks
- **Supported versions:** _current release_ and _current release - 1_


## Release status

- Current release version: {{ $themeConfig.RELEASE_VERSION }}
- Supported former releases: {{ $themeConfig.N1_VERSION }}

### Release v0.15.x - 2020-03-20

| Packages                            | Updated | Version                              |
| ----------------------------------: | :-----: | ------------------------------------ |
| @microsoft/fluid-build-common       |         | 0.14.0 (unchanged from release/0.14) |
| @microsoft/eslint-config-fluid      | ?       | 0.15.0                               |
| @microsoft/fluid-common-definitions |         | 0.13.0 (unchanged from release/0.13) |
| @microsoft/fluid-common-utils       |         | 0.14.0 (unchanged from release/0.14) |
| Server packages                     | ?       | 0.1003.0                             |
| Client packages                     | ?       | 0.15.0                               |
| @microsoft/generator-fluid          | ?       | 0.15.0                               |
| @yo-fluid/dice-roller               | ?       | 0.15.0                               |

### Master branch

| Packages                            | Updated | Version              |
| ----------------------------------: | :-----: | -------------------- |
| @microsoft/fluid-build-common       |         | 0.15.0 (unchanged)   |
| @microsoft/eslint-config-fluid      | ?       | 0.15.0 -> 0.16.0     |
| @microsoft/fluid-common-definitions |         | 0.14.0 (unchanged)   |
| @microsoft/fluid-common-utils       |         | 0.15.0 (unchanged)   |
| Server                              | ?       | 0.1003.0 -> 0.1004.0 |
| Client                              | ?       | 0.15.0 -> 0.16.0     |
| @microsoft/generator-fluid          | ?       | 0.15.0 -> 0.16.0     |
| @yo-fluid/dice-roller               | ?       | 0.15.0 -> 0.16.0     |


## Release history

| Version | Date       | Notes |
| ------- | ---------- | ----- |
| 0.15.0  | 2020-03-20 |       |
| 0.14.0  | 2020-03-02 |       |
| 0.13.0  | 2020-01-30 |       |
| 0.12.0  | 2019-12-09 |       |
| 0.11.0  | 2019-11-05 |       |
| 0.10.0  | 2019-09-24 |       |
| 0.9.0   | 2019-08-26 |       |
