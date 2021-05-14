---
title: Container Properties
menuPosition: 8
---
A *container property* is a property that has children and thus is an inner node in the PropertySet tree. The structure
of a container property is defined via a [Schema]({{< ref "property-schemas.md" >}}) that defines which children the property has and what their types are. We can distinguish two different types of container properties:

**Static Property**
  The structure of this property is fixed. All of its children are defined in the schema. Some of the children might be
  optional (optional children in the schema are currently in development), but those are also defined in the Schema. It
  is not possible to add more children or to change the types of the children.

**Dynamic Property**
  It is possible to add arbitray children to a dynamic property at runtime. Dynamic properties either are instances of
  the **NodeProperty** or they have a schema that inherits from this property. If they have a schema, then they will
  always have the children declared in the schema and the types for those children are fixed. It is possible to extend
  the property by adding more dynamic children.

```javascript
// Register a schema for a static property
let staticSchema = {
    'typeid': 'example:static-1.0.0',
    'properties': [
    { id: 'child', typeid: 'String' }
    ]
};
PropertyFactory.register(staticSchema);

// Register a schema for a dynamic property
let dynamicSchema = {
    'typeid': 'example:dynamic-1.0.0',
    'inherits': ['NodeProperty'],
    'properties': [
    { id: 'childFromSchema', typeid: 'String' }
    ]
};
PropertyFactory.register(dynamicSchema);

// Creating container Properties
let staticProperty = PropertyFactory.create('example:static-1.0.0');
let dynamicProperty = PropertyFactory.create('example:dynamic-1.0.0');

// The children can be accessed via get
let child = staticProperty.get('child')
child.setValue('test');
staticProperty.getValues(); // === {child: 'test'}

// The ids of as children can be retrieved via getIds()
staticProperty.getIds() // === ['child']
dynamicProperty.getIds() // === ['childFromSchema']

// We can also directly create a NodeProperty
let nodeProperty = PropertyFactory.create('NodeProperty');

// After its creation, it has no children
nodeProperty.getIds(); // === []

// It is possible to add additional children to the dynamic properties
dynamicProperty.insert('dynamicChild', PropertyFactory.create('String', undefined, 'dynamic'));
nodeProperty.insert('dynamicChild', PropertyFactory.create('String', undefined, 'dynamic'));

dynamicProperty.getIds(); // == ['childFromSchema', 'dynamicChild']

// The dynamic children can be acceessed in the same way as the children from the schema
dynamicProperty.get('dynamicChild').getValue(); // === 'dynamic'

// the dynamic properties can be removed again
dynamicProperty.remove('dynamicChild');
```
