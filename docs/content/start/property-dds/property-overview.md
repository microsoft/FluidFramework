---
title: PropertySets Overview
menuPosition: 2
---

![Example of a PropertySet tree](/images/property_example_data_model.png)

PropertyDDS represents the managed data in a typed, hierarchical data model called a *PropertySet*. This model has many
similarities to JSON, but is a richer model, which adds more fine-grained types, additional collection types,
references and gives the ability to use schemas to describe the structure of properties.

A PropertySet is a tree structured data model in which every node of the tree is a property that can be of one of the
following categories:

**Primitive Property**
  A primitive property is a leaf in the property tree that stores data and does not have any children of its own.
  It has a type that defines which data is stored in the leaf (e.g. ``String``, ``UInt32``, ``Boolean``).

**Collection**
  PropertyDDS supports three basic types of collections: ``map``, ``set`` and ``array``. These collections can either contain
  other property objects or they can directly contain primitive values.

**Container Property**
  A container property is a property that has child properties. It can either have a fixed structure, which is defined
  via a [Schema]({{< ref "property-schemas.md" >}}), or it can be a *NodeProperty*, which has a dynamic structure. It is also possible to
  dynamically add additional properties to a property with a schema that inherits from *NodeProperty*.

**Reserved Property**
  A reserved property is a container property whose structure is predefined by PropertyDDS.
