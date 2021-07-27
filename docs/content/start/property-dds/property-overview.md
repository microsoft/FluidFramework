---
title: Overview
menuPosition: 1
---

Property DDS represents the managed data in a typed, hierarchical data model called a *PropertySet*. This model has many
similarities to JSON, but is a richer model, which adds more fine-grained types, additional collection types,
references and gives the ability to use schemas to describe the structure of properties.

## Data Model

A PropertySet is a tree structured data model in which every node of the tree is a property that can be of one of the
following categories:

**Primitive Property**
  A primitive property is a leaf in the property tree that stores data and does not have any children of its own.
  It has a type that defines which data is stored in the leaf (e.g. ``String``, ``UInt32``, ``Boolean``).

**Collection**
  Property DDS supports three basic types of collections: ``map``, ``set`` and ``array``. These collections can either contain
  other property objects or they can directly contain primitive values.

**Container Property**
  A container property is a property that has child properties. It can either have a fixed structure, which is defined
  via a [Schema]({{< ref "property-schemas.md" >}}), or it can be a *NodeProperty*, which has a dynamic structure. It is also possible to
  dynamically add additional properties to a property with a schema that inherits from *NodeProperty*.

**Reserved Property**
  A reserved property is a container property whose structure is predefined by Property DDS.

![Example of a PropertySet tree](/images/property_example_data_model.png)


## ProperySet Root

The root of the *PropertySet* hierarchy can be accessed through the root property of the *Property DDS*

```javascript
var rootProperty = myPropertyDDS.root;
```

The root property is of type `NodeProperty` from the root you can traverse the hierarchy and make changes to values,
insert and remove properties.

## Add Data to the PropertySet

```javascript
var stringProperty = PropertyFactory.create('String');

// Set it’s value to 'Hello World!'
stringProperty.setValue('Hello World!');


// Add it to the root property under the id 'myProperty'
rootProperty.insert('myProperty', stringProperty);

console.log('Added one property to the root property');
rootProperty.prettyPrint();
```

### What is Property Factory?

The is a factory object for instantiating Properties. It comes with a set of rich primitive types (Float32, Enum, Uint16
, Uint32, etc. and custom types). For a more detailed explanation please refer to the
[PropertyFactory Section]({{< ref "property-factory.md" >}}).

Changes are always local only and will only modify your local property hierarchy. To share the changes you will have to
`commit`the changes. This will be explained in more detail below.

## Adding Data to Property DDS

Data is added to the Property DDS via "commits"

A Commit is the “unit of change” in Property DDS. It stores an atomic transaction recording every insert, modify and
delete operations that happened since the previous commit.

Much like in Git, a chain of commits is known as a “Branch”. The state of the is constructed by walking along the history and applying the commits on top of the previous one at any point in time. It is important to note that — since history cannot be modified — a must be referring the most recent state in order to persist any changes in Property DDS.

```javascript
myPropertyDDS.commit()
```

## Read Data From The PropertySet

Naturally, after writing data to a Fluid Property DDS we need the ability to retrieve this data. For this, we must initialize the Property DDS with the Fluid `documentId`from the Property DDS that we wrote or data into. Once the *Property DDS* is fully initialized by the FluidFramework you can retrieve that data.

```javascript
// Get the root property
var rootProperty = myPropertyDDS.root;

// Fetch the string property we previously inserted
var stringProperty = rootProperty.resolvePath('myProperty');

console.log(`My string property has value ${stringProperty.getValue()}`);
// My string property has value Hello World!
```
