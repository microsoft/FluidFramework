---
title: Feb 2020 Fluid Runtime team update
date: 2020-02-04
sidebarDepth: 2
---

# Feb 2020 Fluid Runtime team update

Welcome to 2020! The Fluid Runtime team has hit the ground running this year, and with our first sprint closing down and
another about to start, it's a great time to take stock of where we are and what's next. But first, if you're wondering
who the Fluid Runtime team is and what we do, [we've got you covered](../team.md).


## January: A brief look back

January saw the Fluid team engage more broadly with internal partners, including Teams, OWA, OneNote, Office
Programmability, Fabric, SPFx, among others. A key goal for the runtime team is to grow the Fluid developer base in a
sustainable way, which means we need to enable a "self-service" model as much as possible.

In January we began work to address these issues in several ways. As part of this effort, we updated the docs
organization and UI, we now have an [end-to-end tutorial for the Sudoku component](../examples/sudoku.md), and we have a
[detailed description of the code](../examples/yo-fluid-breakdown.html) that is produced by the `yo fluid` scaffold.


## February focus

We are focused on the areas below in February 2020. See the [February 2020
milestone](https://github.com/microsoft/FluidFramework/milestone/4) in GitHub for more details and to track our work.

Note: Many of these projects will continue beyond February.


### Component framework & patterns

<Badge text="Skyler Jokiel" vertical="middle" />

* [Design](https://github.com/microsoft/FluidFramework/issues/1015)
* [GitHub project](https://github.com/microsoft/FluidFramework/projects/12)

We are investigating various component patterns as part of a project called
[Vltava](https://github.com/microsoft/FluidFramework/issues/1015). The plan is to create a "Experience" that can manage
and create multiple surfaces. These surfaces are each Components and should be able to interact with each other as well
as global services and components. This "Experience" will be a test ground for trying out component model patterns.


### Component interaction model

<Badge text="Matt Rakow" vertical="middle" />

* [Design](https://github.com/microsoft/FluidFramework/issues/1090)
* [Framework interfaces GitHub project](https://github.com/microsoft/FluidFramework/projects/16)

As partners start to build components, we need to establish interfaces and conventions for component to component
interaction and communication, in order for them to work well together.We are working to standardize a set of interfaces
designed to support scenarios requiring cooperation between distinct components, or between components and the app.
Fluid can be used without these interfaces (as it is today), but these interfaces will serve as the public API contract
that Microsoft apps and components will follow, establishing an ecosystem of apps and components that know how to work
with one another. This ecosystem adds value for component and app developers, who will be able to achieve these
cooperative scenarios with a broad catalog of other components and apps.


### Render/view

<Badge text="Matt Rakow" vertical="middle" />

* [Design](https://github.com/microsoft/FluidFramework/issues/1042)
* [GitHub project](https://github.com/microsoft/FluidFramework/projects/14)

We are re-thinking how rendering and views are handled within the Framework. See the [design
discussion](https://github.com/microsoft/FluidFramework/issues/1042) for more information about the plans.


### Data interactivity

<Badge text="Vlad Sudzilouski" vertical="middle" />

* [GitHub project](https://github.com/microsoft/FluidFramework/projects/18)

Data interactivity is where the Fluid Framework excels (e.g. table/chart instantaneous updates), so we are pushing to
finalize the interface and patterns that facilitate data exchange between components and establish a default data-model
component that developers can reuse (e.g. table-document).


### Creation Flow / Singletons

<Badge text="Vlad Sudzilouski" vertical="middle" />

* [Design](https://github.com/microsoft/FluidFramework/issues/1096)

Today, it’s tempting to initialize container by having singleton components with well-defined names / IDs, relying on
being connected through initialization process and be the only one online client on the wire. That’s the easiest but not
correct (robust to failure) way of initialization. We're working on better patterns to address these needs.


### Version migration

<Badge text="Arin Taylor / Wes Carlson" vertical="middle" />

* [GitHub project](https://github.com/microsoft/FluidFramework/projects/13)

The goal is to make sure the Fluid Framework can support the various code upgrade scenarios. The core idea is that when
the loaded runtime needs to update to a new version, one of the clients can propose that new code to be used, and all
clients of that document will reload with the newer code.


### Host patterns and API

<Badge text="Tony Murphy" vertical="middle" />

* [GitHub project](https://github.com/microsoft/FluidFramework/projects/15)


### Documentation

<Badge text="Tyler Butler" vertical="middle" />

Excellent documentation is key to a self-service model for Fluid development. We continue to invest in improved
documentation and examples and we are removing outdated information. If anyone asks you where to learn about Fluid,
please point them to <https://aka.ms/fluid>.


### Initializing the private partner program

<Badge text="Skyler Jokiel / Tyler Butler" vertical="middle" />

We are working with the SPFx team to get the private partner program up and running. We're aiming to onboard our first
partner by the end of February.
