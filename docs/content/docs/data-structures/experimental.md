---
title: Experimental data structures
menuPosition: 13
---

{{< callout "note" "Experimental" "🧪" >}}

This page is about **EXPERIMENTAL** work.

We think it's close to being ready, so we wanted to show it to you early, but the API surface will likely break!

{{< /callout >}}

## Property DDS

[PropertyDDS](https://github.com/microsoft/FluidFramework/tree/main/experimental/PropertyDDS) represents the managed
data in a typed, hierarchical data model called a *PropertySet*. This model has many similarities to JSON, but is a
richer model, which adds more fine-grained types, additional collection types, references, and gives the ability to use
schemas to describe the structure of properties.

A PropertySet is a tree structured data model in which every node of the tree is a property. More documentation on this
DDS will be available over time.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
