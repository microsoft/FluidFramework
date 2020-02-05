---
sidebarDepth: 2
---

# Fluid Runtime team

The Fluid Runtime team is responsible for maintaining the core Fluid runtime, as well as the framework, distributed
data structures, drivers, sample hosts, and tooling. Stated differently, the runtime team are the core maintainers of
[Microsoft/FluidFramework](https://github.com/microsoft/FluidFramework/) on GitHub.

People-wise, the runtime team is Curtis Man and his team, but the team also works with Kurt Berglund's team and Steve
Lucco very closely.


## How we work

The Fluid runtime team is – wait for it – *fluid* in how we work. However, we have established primary engineering
contacts for [major areas](#areas-and-experts). Should you need to work with the team in a specific area, please start
with the primary engineering contacts for that area.


## How should I engage with the runtime team?

We are consolidating as much as possible to our GitHub presence. If you think you've found a bug, please [file an issue][].
If you wish there was better documentation on a specific topic, please [file an issue][].


## Areas and experts

| Component Model                                         | Expert           | Backup        |
| ------------------------------------------------------- | ---------------- | ------------- |
| Interfaces - Render/UX/Accessibility/Theming/Commanding | Matt Rakow       | Skyler Jokiel |
| Interfaces – Data Model/Binding                         | Vlad Sudzilouski | Matt Rakow    |
| App Patterns/Framework                                  | Skyler Jokiel    | Tony Murphy   |
| External component loading                              | Tony Murphy      | Skyler Jokiel |
| Loader/Hosts/Security                                   | Tony Murphy      | Matt Rakow    |


| Core Runtime                       | Expert      | Backup           |
| ---------------------------------- | ----------- | ---------------- |
| Perf/Reliability/Version Migration | Arin Taylor | Vlad Sudzilouski |
| Driver                             | Jatin Garg  | Vlad Sudzilouski |
| Telemetry                          | Wes Carlson | Vlad Sudzilouski |


[file an issue]: https://github.com/microsoft/FluidFramework/issues/new
