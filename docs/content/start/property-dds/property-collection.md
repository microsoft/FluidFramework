---
title: Collection Properties
menuPosition: 6
---

Property DDS supports three different types of collection Properties: ``array``, ``map`` and ``set``. Property DDS distinguishes between
two different types of collections:

**Primitive Collections**
  Primitive collections are strictly typed with one of the Primitive Property Types (e.g. a String array or Float64
  map). These collections directly contain the literal values of the given type. They do not support polymorphism, all
  entries have to be of the same type. The collection itself is a leaf in the PropertySet tree. This means, there are
  no Property objects for the entries of the collection. All interactions (e.g. setting and getting the values of
  entries) with the collection are done via the object for collection property. It is not possible to address the
  entries of a primitive collection via a path (since paths always refer to property objects).

**Property Collections**
  A property collection contains other Property objects. It therefore is not a leaf, but an inner node in the
  PropertySet tree. It is possible to create **polymorphic property collections**, which can contain properties of
  different types of properties.

  - If a property collection of properties with a user registered schema is created, it is admissible to also add
    properties of types that inherit from this schema
  - A property collection without a typeid (either leaving out the ``typeid`` entry in the schema or passing
    undefined in the ``create`` call) may contain arbitrary properties (with the exception that primitive properties in
    a polymorphic array are not yet supported)

  The collection itself only supports adding and removing property objects. Modifications of the contained properties is
  done via their property objects (e.g. by calling ``setValue`` on a contained property). It is possible to address the
  entries of the collection via paths, which will return the property objects.

This distinction between the two types of collections exists for performance reasons. Primitive collections can store
their content in an optimized way internally, without the need to create a separate property object for every contained
entry. For example, an array of ``Int32``, with 100.000 entries is internally stored using only 400.000 bytes of memory.
If instead property objects would be created for every entry, this would be prohibitively costly. Therefore, the
unfortunate inconsistency in the interface between the two different types of collections is necessary to allow storing
large collection of primitive types efficiently.

Primitive Collections exist currently only for ``map`` and ``array`` collections. Primitive ``set`` collections are not
yet supported.

## Arrays

Arrays are ordered collections in which every entry in the array is addressed by its index (zero based). An array should
only be used, if the order of the entries is important and has to be maintained. Arrays support the insertion and
removal of individual properties or ranges at arbitrary positions in the array. If such an insertion or removal happens,
all entries after the position of insertion will be shifted accordingly (which changes their indices).

If multiple collaborators insert or remove entries in an array simultaneously, the rebase will automatically rewrite the
indices in such a way that the operations performed by the other collaborator are taken into account, e.g. if you insert
something at position 5 and a collaborator inserted in parallel 3 entries at position 3, your insert will be rewritten
to an insert at position 8, so that you still insert at the correct position in the array. For more details on this, see
the section on `Operational Transforms`. This necessity to perform these index rewriting operations when multiple
collaborators perform operations on the same array, means that every simultaneous insertion / removal from an array has
to be treated as a conflict. Therefore, if the order of the entries in a collection is not relevant, it is usually more
efficient to use maps or sets, because those allow independent insertion / removal of separate entries without conflicts.
For more details see the sections on `Conflict Resolution`.

The following code section shows some of the possible operations on a primitive array property (for a full list please
consult the API reference):

```javascript
// Create a string array property
let stringArrayProperty = PropertyFactory.create('String', 'array');

// New entries can be added at the end via the push function
stringArrayProperty.push('entry 1');

// It is also possible to push multiple entries by providing an array
stringArrayProperty.push(['entry 2', 'entry 3']);

// The get function can be used to access an entry of the array
stringArrayProperty.get(2) // === 'entry 3'

// The contents of the array can be accessed via the getEntriesReadOnly
// or the getValues functions. Both returns all entries of the property
// as a JS array. The getValues function will return a new array with a
// copy of the entries, getEntriesReadOnly directly returns the internal
// data array (which is more efficient, since it avoids the copy operation).
//
// Warning: DO NOT MODIFY THE ARRAY RETURNED BY getEntriesReadOnly DIRECTLY.
//
// This function may only be used for read only operations on the array.
// If you were to perform direct modifications of this array, those would not
// be correctly tracked and the changes would not be committed.
stringArrayProperty.getValues() // === ['entry 1', 'entry 2', 'entry 3']
stringArrayProperty.getEntriesReadOnly() // === ['entry 1', 'entry 2', 'entry 3']

// Set is used to change an entry
stringArrayProperty.set(2, 'ENTRY 3')

// Removing entries from the end of the array can be done via the pop command
stringArrayProperty.pop()  // === 'ENTRY 3'

// Adding and removing entries at the beginning of the array can be done
// via the unshift and shift functions
stringArrayProperty.unshift('entry 0');
stringArrayProperty.getValues() // === ['entry 0', 'entry 1', 'entry 2']
stringArrayProperty.shift(); // === 'entry 0'

// You can also insert or remove entries from the middle of the array
stringArrayProperty.insert(1, 'entry 0.5');
stringArrayProperty.insertRange(1, ['entry 0.1', 'entry 0.2']);
stringArrayProperty.getValues() // === ['entry 0', 'entry 0.1', 'entry 0.2', 'entry 0.5', 'entry 1', 'entry 2']

stringArrayProperty.remove(1); // === 'entry 0.1'
stringArrayProperty.removeRange(1, 2); // === ['entry 0.2', 'entry 0.5']

// It is also possible to modify a range of entries in the array at once
stringArrayProperty.setRange(1, ['ENTRY 1', 'ENTRY 2']);
stringArrayProperty.getValues() // === ['entry 0', 'ENTRY 1', 'ENTRY 2']
```

The operations on a property array are similar, but instead of taking literals as input, the functions now use
property objects as input and output.

```javascript
// Register a simple test schema
let textSchema = {
    typeid: 'example:text-1.0.0',
    properties: [
    { id: 'text', typeid: 'String'},
    ]
};
PropertyFactory.register(textSchema);

// Helper function which creates a new example:text-1.0.0 Property
let textProperty = text => PropertyFactory.create('example:text-1.0.0', undefined, {text: text} );

// Create a array property for the example:text-1.0.0 objects
let textArrayProperty = PropertyFactory.create('example:text-1.0.0', 'array');

// New entries can be added at the end via the push function
textArrayProperty.push(textProperty('entry 1'));

// It is also possible to push multiple entries by providing an array
textArrayProperty.push([textProperty('entry 2'), textProperty('entry 3')]);

// The function get returns the property object at a specific index,
let property = textArrayProperty.get(2);

// To get the actual data stored at this position, you have to use
// methods of the property object, e.g.
property.getValues()  // === {text: 'entry 3'}

// Changing the value of the properties is then done directly on the property object
property.get('text').setValue('ENTRY 3')

// The internal array containing the property objects can be obtained via the
// getEntriesReadOnly function. Similar to the case for the primitive array
// property above, you MUST NOT directly modify this array (e.g. inserting
// or removing entries from the JS array).
//
// You may change the property objects returned in the array by calling their
// modification methods.
let properties = textArrayProperty.getEntriesReadOnly() // Returns an array with 3 property objects
properties[1].get('text').setValue('ENTRY 2'); // This is allowed

// The getValues function will return a JSON serialization of the array
textArrayProperty.getValues() // [{text: 'entry 1'}, {text: 'entry 2'}, {text: 'ENTRY 3'}]

// Removing entries from the end of the array can be done via the pop command
textArrayProperty.pop(); // Returns a property object with text property set to 'ENTRY 3'

// Adding and removing entries at the beginning of the array can be done
// via the unshift and shift functions
textArrayProperty.unshift(textProperty('entry 0'));
textArrayProperty.getValues() // === [{text: 'entry 0'}, {text: 'entry 1'}, {text: 'ENTRY 2'}]
textArrayProperty.shift().getValues(); // === {text: 'entry 0'}

// You can also insert or remove entries from the middle of the array
textArrayProperty.insert(1, textProperty('entry 0.5'));
textArrayProperty.insertRange(1, [textProperty('entry 0.1'), textProperty('entry 0.2')]);
textArrayProperty.remove(1);
textArrayProperty.removeRange(1, 2);
```

## Maps

A ``map`` is a collection that identifies its entries via strings as key. As for array properties, there are both
primitive maps and property maps. The basic operations on maps are `get`, `insert`, `set` and `remove`, each on an entry
with a given key. The difference between inserting and setting an entry is that an insertion under a key that already
exists is treated as an error, whereas setting an entry will overwrite the existing entry.

For property maps, there are two different ways an existing entry can be modified. The first option is to `get` the
property object of the child and perform modifications on the child property object itself (e.g. by calling `setValue`).
The second option is to create a new property object and to call `set` to overwrite the existing entry.

To understand the behavior of the collision handling and rebasing operations it is necessary to distinguish those two
types of operations. Calling `set` is considered as an operation that fully replaces the existing property with a
completely new property. In that case, colliding operations will not be merged during the rebase. The last set operation
will fully replace the property and previous modifications by other collaborators will be overwritten. This is done,
because it is assumed that modifications that referred to the old property are not compatible with the new property. In
contrast, if there multiple independent modifications of the first type (i.e. they were performed directly on different
children of a property in the map) those are merged, because it is assumed that they all refer to the same property and
thus should be mutually compatible.

The following code shows a few examples of how to use maps:

```javascript
// Register a simple test schema
let textSchema = {
    typeid: 'example:text-1.0.0',
    properties: [
    { id: 'text', typeid: 'String'},
    ]
};
PropertyFactory.register(textSchema);

// Helper function which creates a new example:text-1.0.0 Property
let textProperty = text => PropertyFactory.create('example:text-1.0.0', undefined, {text: text} );

// Create a primitive map
let stringMapProperty = PropertyFactory.create('String', 'map');

// Create a property map
let textMapProperty = PropertyFactory.create('example:text-1.0.0', 'map');

// insert into the map
stringMapProperty.insert('entry 1', 'My first string in a map');
textMapProperty.insert('entry 1', textProperty('My first property in a map'));

// Get the entries
stringMapProperty.get('entry 1');                 // === 'My first string in a map'
let property = textMapProperty.get('entry 1');    // Returns a Property object
property.get('text').getValue();                  // === 'My first property in a map'

// Modifying the properties
stringMapProperty.set('entry 1', 'My first modified string in a map');
property.get('text').setValue('Property modification');       // Modification via the property object
textMapProperty.set('entry 1', textProperty('New Property')); // Overwriting the property

// Getting all keys in the map
stringMapProperty.getIds();   // === ['entry 1]

// Checking for the existence of a specific key
stringMapProperty.has('entry 1'); // === true

// Removing a key from the map
stringMapProperty.remove('entry 1'); // === 'My first modified string in a map'
textMapProperty.remove('entry 1');   // Returns the removed property object
```

## Sets

A set is an unordered collection of properties. Currently, Property DDS only supports sets for
`NamedProperties`, i.e. properties that have a unique GUID associated with them. The set is
internally implemented as a map where the key to a property is always its GUID. Named properties can be inserted into
maps without explicitly specifying their GUID, Property DDS will automatically take the GUID of the named property. At the
moment, Property DDS does not support primitive property sets. To access a property in the set, it is addressed via the GUID.

The following code shows how sets can be used:

```javascript
// Register a simple test schema
let namedTextSchema = {
    typeid: 'example:namedText-1.0.0',
    inherits: ['NamedProperty'],
    properties: [
    { id: 'text', typeid: 'String'},
    ]
};
PropertyFactory.register(namedTextSchema);

// Helper function which creates a new example:namedText-1.0.0 Property
let textProperty = text => PropertyFactory.create('example:namedText-1.0.0', undefined, {text: text} );

// Create a set of namedTexts
let textSetProperty = PropertyFactory.create('example:namedText-1.0.0', 'set');

// insert into the set
textSetProperty.insert(textProperty('My first property in a set'));
textSetProperty.insert(textProperty('My second property in a set'));

// Getting all keys in the map
let GUIDs = textSetProperty.getIds();   // Returns an array with two GUIDs in it

// Get a specific entry from the map
let property = textSetProperty.get(GUIDs[0]);

// Modifying the properties
property.get('text').setValue('Property modification');

// Checking for the existence of a specific key
textSetProperty.has(GUIDs[0]);           // === true
textSetProperty.has(property.getGuid()); // === true

// Removing entries from the set (either via key or property object)
textSetProperty.remove(property);   // Returns the removed property object
textSetProperty.remove(GUIDs[1]);   // Returns the removed property object
```
