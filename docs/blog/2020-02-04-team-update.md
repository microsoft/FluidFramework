---
title: Fluid runtime update
date: 2020-02-04
# sidebar: auto
---

# Fluid runtime update January 2020

Welcome to 2020! The Fluid Runtime team has hit the ground running this year, and with our first sprint closing down and
another about to start, it's a great time to take stock of where we are and what's next. But first, if you're wondering
who the runtime team is and what we do, [we've got you covered](../team.md).

[[toc]]

## January: Partners and scaling out

January saw the Fluid team engage more broadly with internal partners, including Teams, OWA, OneNote, Office
Programmability, Fabric, SPFx, among others. A key goal for the runtime team is to grow the Fluid developer base in a
sustainable way, which means we need to enable a "self-service" model as much as possible. In January we began work to
address these issues in several ways. This work will continue into February.

### Component Framework

<Badge text="Skyler Jokiel" vertical="middle" />

The component framework – often called the Aqueduct – is the primary way that Office developers will interact with
Fluid. It represents a higher-level public API, and is designed to lower the barrier to entry to building componentized
Fluid applications. We are exploring several patterns for constructing

Note: Aqueduct is one of many scenario-focused "frameworks" that we imagine being built on top of Fluid. Aqueduct's
focus is on componentization, while other frameworks will have different focuses and possibly narrower uses. Aqueduct is
not intended to be a "one size fits all" framework for Fluid.

### Documentation

<Badge text="Tyler Butler" vertical="middle" />

Excellent documentation is key to a self-service model for Fluid development. We continue to invest in improved
documentation and examples and we are removing outdated information. If anyone asks you where to learn about Fluid,
please point them to <https://aka.ms/fluid>. In January, we updated the docs organization and UI, we now have an
[end-to-end tutorial for the Sudoku component](../examples/sudoku.md), and we have a detailed description of the code
that is produced by the yo fluid scaffold. We will continue to invest in documentation in the coming sprints.

### Component interaction model

<Badge text="Matt Rakow" vertical="middle" />

As partners start to build components, we need to establish interfaces and conventions for component to component
interaction and communication, in order for them to work well together. We are working with the Bohemia experts to
refine what they've developed in this space and bring them into the main Fluid repo as part of the Framework.


### Data interactivity

<Badge text="Vlad Sudzilouski" vertical="middle" />

Data interactivity is where the Fluid Framework excels (e.g. table/chart instantaneous updates), so we are pushing to
finalize the interface and patterns that facilitate data exchange between components and establish a default data-model
component that developers can reuse (e.g. table-document).


### Core runtime reliability and performance

As we make dramatic code changes to Fluid, we need to ensure we don't break it! We are investing in automation, testing,
and telemetry to guard against reliability and performance regressions.

#### Primary engineering contacts:

Perf, reliability, and version migration Arin Taylor; Vlad Sudzilouski

Driver: Jatin Garg; Vlad Sudzilouski

Telemetry: Wes Carlson; Vlad Sudzilouski

What are we working on in February?

February will see us continue the work we started in January. In particular, the component interaction model being
driven by Matt and Vlad will continue to be a major focus.

See the February 2020 milestone in GitHub for more details and to track our work over time.

Standing up the private partner program

In addition to continuing our January work, we are working with the SPFx team to get the private partner program up and
running. We're aiming to onboard our first partner by the end of February.

Primary engineering contacts: Skyler Jokiel; Tyler Butler
