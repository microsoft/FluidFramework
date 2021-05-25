---
title: Reserved Properties
menuPosition: 8
---
Reserved properties are container properties whose Schema is inbuilt into Property DDS. These properties have a special meaning
for Property DDS and Property DDS might provide additional functionality for those object types.


## NamedProperty

A *NamedProperty* is a property which has a unique GUID associated to it. This enables the application and Property DDS to
uniquely identify a property that has a schema inheriting from NamedProperty. This allows tracking of the property, for
example when it is moved inside of the document.

Property DDS automatically assigns a new random GUID when a NamedProperty is created by the PropertyFactory. The GUID
must be unique within the PropertySet, so the application has to be careful when cloning names properties to not insert
multiple properties with the same GUID into the document.

The NamedProperty has the following schema:

```json
{
  "typeid": "NamedProperty",
  "properties": [
    { "id": "guid", "typeid": "String" }
  ]
}
```

NamedProperties can be inserted as children into NodeProperties and into sets, without explicitly giving an Id. In those
cases the GUID will automatically be used as the id.

The following code shows how to use a NamedProperty:

```javascript
// Register a schema for a property that inherits from NamedProperty
let namedPropertySchema = {
    'typeid': 'example:namedProperty-1.0.0',
    'inherits': 'NamedProperty',
    'properties': [
    { id: 'child', typeid: 'String' }
    ]
};
PropertyFactory.register(namedPropertySchema);

// Create a named property instance (this will assign a new GUID)
let property = PropertyFactory.create('example:namedProperty-1.0.0');

// Get the GUID of the property
property.getGuid();               // Returns the GUID
property.get('guid').getValue();  // Equivalent to getGuid()

// Insert a NamedProperty into a NodeProperty
let nodeProperty = PropertyFactory.create('NodeProperty');
nodeProperty.insert(property);

nodeProperty.get(property.getGuid()); // == property
```

## RelationshipProperty

A relationship is used to express in a standardized way that two properties are related to each other. In contrast to a
reference, which is a primitive property, a relationship is a container property. This Applications can define custom
relationship types by inheriting from the relationship property. They can also add meta-data to the relationship, either
by declaring them in the schema for their custom relationship or by adding them dynamically to the relationship.

```json
{
  "typeid": "RelationshipProperty",
  "inherits": [ "NodeProperty", "NamedProperty" ],
  "properties": [
    { "id": "to", "typeid": "Reference" }
  ]
}
```
