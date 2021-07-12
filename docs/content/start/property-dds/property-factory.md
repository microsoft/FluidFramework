---
title: PropertyFactory
menuPosition: 3
---

The application creates properties via a singleton class called the ``PropertyFactory``. This factory is responsible
both for registering schemas and for the creation of properties.

The singleton instance can be obtained via

```javascript
const {PropertyFactory} = require('@fluid-experimental/property-properties');
```

Property objects are created by calling its ``create`` function. This function takes the typeid of the property to
create as first parameter. The second parameter is the ``context``. The context of a property determines whether a
collection is created. If it is omitted or ``'Single'`` is passed, no collection is created. Otherwise a collection of
the requested type will be created. The third parameter gives the initial value of the property. For primitive
properties, it is just a literal, for Container Properties it can be JSON with the values for the child properties. A
schema can be registered via the ``register`` function of the ``PropertyFactory``.

```javascript
// Create a float64 property
let float64Property = PropertyFactory.create('Float64');

// Create an array of Strings
let stringArrayProperty = PropertyFactory.create('String', 'array');

// Create a polymorphic map
let mapProperty = PropertyFactory.create(undefined, 'map');

// Create a String property with the initial value 'My String'
let stringProperty = PropertyFactory.create('String', undefined, 'My String');

// Register a schema
let positionSchema = {
    typeid: "shape:position2d-1.0.0",
    properties: [
    { id: "x", typeid: "Float64"},
    { id: "y", typeid: "Float64"}
    ]
};
PropertyFactory.register(positionSchema);

// Create a property of type shape:position2d-1.0.0
let positionProperty = PropertyFactory.create('shape:position2d-1.0.0', undefined, {
    x: 10,
    y: 20
});
```


The following sections explains a few basic operations that can be performed on every property object:
```javascript
// Printing the contents of a property for debugging purposes
positionProperty.prettyPrint()

// Getting the contents of the property as a JSON
positionProperty.getValues()   // == {x: 10, y: 20}
stringProperty.getValues()     // == 'My String'

// Getting the typeid and context of a property
positionProperty.getTypeid()   // == 'shape:position2d-1.0.0'
positionProperty.getContext()  // == 'single'

stringArrayProperty.getTypeid()  // == 'String'
stringArrayProperty.getContext() // == 'array'

// All collections and contained properties support the
// method get to access their children
positionProperty.get('x'); // Returns the property object for the x property

// To avoid calling get many times in succession, it can be called with an array
// This will recursively walk down the property tree in multiple steps
mapProperty.insert('test', positionProperty);
mapProperty.get(['test', 'x']) // Returns the property object for the x property

// It is also possible to address properties via paths, but this is less efficient
// than using get
mapProperty.resolvePath('[test].x')

// A property that is part of a collection or a child of a container property
// has a parent
positionProperty.getParent();    // === mapProperty

// If the property has not yet been inserted into any collection its parent is undefined
stringArrayProperty.getParent(); // === undefined
```
