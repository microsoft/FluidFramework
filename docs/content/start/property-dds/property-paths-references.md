---
title: Paths and References
menuPosition: 5
---

Properties can be addressed in Property DDS via path. A path describes how to get from a starting point in the property tree to
another property.

A path consists of a sequence of segments, each describing how to get from a property to one of its children. The segments
are separated with the ``.`` character for container properties. Collections use the square brackets ``[]`` to address their
children.

```javascript
// Create a simple PropertySets tree
let positionSchema = {
typeid: "shape:position2d-1.0.0",
properties: [
    { id: "x", typeid: "Float64"},
    { id: "y", typeid: "Float64"}
]
};
PropertyFactory.register(positionSchema);

let root = PropertyFactory.create('NodeProperty');
let point = PropertyFactory.create('shape:position2d-1.0.0');
root.insert('point', point);

let map = PropertyFactory.create('shape:position2d-1.0.0', 'map');
pointInMap = PropertyFactory.create('shape:position2d-1.0.0');
map.insert('point2', pointInMap);
root.insert('map', map);

// Now we can resolve paths
root.resolvePath('point.x');
root.resolvePath('map[point2].x');
```

By default, property paths are **relative paths**. The traversal starts at the property on which the `resolvePath`
method has been called.

For example:

```javascript
// Resolve relative to the properties
root.resolvePath('point.x'); // Resolve relative to the root
point.resolvePath('x');      // Resolve relative to the point

root.resolvePath('map[point2].x'); // Resolve relative to the root
map.resolvePath('[point2].x');     // Resolve relative to the map
```

It is possible to walk upwards in the property sets tree, by starting a path with `../`. Every occurrence of this
string at the start of a path means that the traversal walks up by one level in the PropertySets tree. In contrast
to file system paths, it is not valid, to specify this string in the middle of a path.

```javascript
pointInMap.resolvePath('../../point'); // Walk upwards by two levels
```

An empty path resolves to the property itself:

```javascript
map.resolvePath(''); // === map
```

If you are using .resolvePath instead of get and you have dots or some other reserved characters in your property ids,
they will conflict with the path separator and other delimiters so you will need to quote them if you want to use
resolvePath(). The reserved characters in paths are ``" \ [ ] . * /`` (Note that single quote ``'``  and space)
are NOT reserved characters).

```javascript
// Create a property with special characts in its id
map.insert('has/special\\chars[*]', PropertyFactory.create('shape:position2d-1.0.0'));
root.insert('"doubleQuotes"', PropertyFactory.create('shape:position2d-1.0.0'));
root.insert('with spaces', PropertyFactory.create('shape:position2d-1.0.0'));

// Quoting is necessary to address the properties
root.resolvePath('map["has/special\\\\chars[*]"].x');
root.resolvePath('"\\"doubleQuotes\\""].x');

// Spaces don't need to be escaped
root.resolvePath('with spaces.x');

// Property DDS proxies a helper function to perform quoting where needed
let {PathHelper} = require('@fluid-experimental/property-changeset');
root.resolvePath(PropertyUtils.PathHelper.quotePathSegmentIfNeeded('"doubleQuotes"'));
```

A path that starts with a ``/`` is an **absolute path**. This means the resolution will start at the root of the
PropertySets tree, no matter which of the properties in the tree is used as starting point of the resolution.

```javascript
// The following all resolve to the same property
root.resolvePath('/point.x');
map.resolvePath('/point.x');
pointInMap.resolvePath('/point.x');
```

The application can obtain the path to a property via the two functions ``getAbsolutePath`` and ``getRelativePath``.
``getAbsolutePath`` returns the path from the root of the PropertySets tree, whereas ``getRelativePath`` takes a second
property ``fromProperty`` as parameter and returns the path ``p``, so that ``fromProperty.resolvePath(p)`` returns the
original property.

```javascript
// Determine the absolute path of a property
pointInMap.getAbsolutePath();     // === 'map[point2]'

// Determine the relative path between two properties
pointInMap.getRelativePath(root); // === 'map[point2]'
pointInMap.getRelativePath(map);  // === '[point2]'
map.getRelativePath(pointInMap);  // === '../'
```

## Reference Properties

A ReferenceProperty references another property (the **Referenced Property**) within the Property DDS via a path. This
reference is transparently resolved while traversing the property sets tree.

**Example**

![Reference Property Example 1](/images/reference_properties_example1.png)

Looks to the application like this:

![Reference Property Example 2](/images/reference_properties_example2.png)



## Creating a ReferenceProperty

You can create a ReferenceProperty by passing the typeid ``Reference`` to ``PropertyFactory.create``. This will create
an anonymous reference. Optionally, you can restrict the reference to referenced properties of specific types,
by adding the type in angular brackets to the reference. A typed reference must point to a property with the
specified type or a property that inherits from the specified type. If you have a reference to a collection,
you also have add the context to to the typeid using angular brackets (see the example below).

> Reference type validation is currently not yet implemented. Once this validation will be enabled,
> assigning a property that is of the wrong type as a target will throw an error.

```javascript
// Creating an anonymous reference
var reference = PropertyFactory.create('Reference');
map.insert('reference', reference);

// Creating a typed reference
PropertyFactory.create('Reference<String>');

// Creating a typed reference to a collection
PropertyFactory.create('Reference<Array<String>>');
PropertyFactory.create('Reference<Map<String>>');
```

A ReferenceProperty can also be included as part of a property schema, once again by using the typeid "Reference":

```json
 {
    "typeid": "autodesk.test:example-1.0.0",
    "properties": [
      {"id": "ref", "typeid": "Reference"},
      {"id": "typed_ref", "typeid": "Reference<Float32>"},
      {"id": "other", "typeid": "String"}
    ]
  }
```

## Setting the reference

If not specified, the Reference’s stored path will be an empty string and it will point to an undefined property.You can
set a reference via the `setValue` function by providing the referenced property's absolute path, or its path relative
to the parent of the reference property. It is also possible to set a reference by using the `set` method, and providing the
referenced property itself. This will automatically use the absolute path of that property as the stored path.

```javascript
reference.setValue('/point');    // resolution via an absolute path
reference.setValue('[point2]');  // where point2 is a sibling inside of map

reference.set(point);
reference.getValue();            // === '/point'
```

Note that referencing a property across a Repository Reference requires some special considerations due to
``getAbsolutePath`` returning the path from the referenced repository's root. Consult the :ref:`Working with Repository
References` section for more details.


## Resolving to the target property

By default, calling '`get'` or '`resolvePath'` on a ReferenceProperty will
resolve the referenced property. If the array passed to ``get`` or the
path contain segments after the reference, the resolution will continue
from the referenced property.

For example

```javascript
reference.setValue('/point');

// The following three, will all resolve to point
reference.get();
root.get(['map', 'reference']);
root.resolvePath('map[reference]');

// The following, will all resolve to point.x
reference.get(['x']);
root.get(['map', 'reference', 'x']);
root.resolvePath('map[reference].x');
```


### Resolving the Reference property itself


By default, references are transparently resolved when calling ``get`` or ``resolvePath``. This meant that when calling
those functions you will get the referenced property not the reference itself. For example, if you have a reference
``ref1`` pointing to the property ``target``, the following would return ``target``:

```javascript
myProp.get('ref1');
```

If you need to get the ReferenceProperty itself, for example because you want to change where the reference is pointing
to, there are different ways to do this:

**get with token**

```javascript
myProp.get(['ref1', BaseProperty.PATH_TOKENS.REF]);
```

This token indicates that the reference property will be returned for
the preceding reference path segment instead of the referenced
property.


> this only works if ``get`` is passed an array. You cannot call

```javascript
myProp.get('ref1').get(BaseProperty.PATH_TOKENS.REF);
```

  The token needs to be in the same array as the reference path segment
  preceding it.

**get with reference resolution option**



```javascript
myProp.get('ref1', {ReferenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
```

The second (optional) parameter to ``get`` allows you to set a ReferenceResolutionMode (in JavaScript by passing an
options array with the entry ``ReferenceResolutionMode``, in c++ and C# directly via the second parameter) . By default,
``ReferenceResolutionMode`` is set to ALWAYS. By setting it to NEVER, none of the references passed to ``get`` will be
resolved. As a result, when ``get`` encounters a path segment leading to a reference, it will return the
ReferenceProperty. Similarly, you can set the mode toNO_LEAFS, which will resolve all references, except for the last
one. In that case:

```javascript
myProp.get('ref1').get(BaseProperty.PATH_TOKENS.REF);
```

where ref1 points to a property called ``target``, it will return the
target after the first ``ref1`` path, then follow ``nested`` inside of
``target`` and ``ref2`` will return a reference property.

**resolvePath with token**

```javascript
myProp.resolvePath('ref1*');
```

The asterisk is a token in a path that works in a way that is similar to the ``get`` method’s REF token. It indicates
that the preceding reference path segment will not follow the reference and instead return the ReferenceProperty
instead.

>``resolvePath`` is less performant than ``get``, because it has to first tokenize the provided path. We recommend
> that you use ``get`` whenever possible)

## Other methods available to Reference properties



### ``getReferenceTargetTypeid``

This method will return the target typeid from the type of a typed reference.

For example:

```javascript
// Call getReferenceTargetTypeid for a typed reference
var reference = PropertyFactory.create('Reference<String>');
reference.getReferenceTargetTypeid(); // === 'String'

// Call getReferenceTargetTypeid for an anonymous reference
var anonymousReference = PropertyFactory.create('Reference');
anonymousReference.getReferenceTargetTypeid(); // === 'BaseProperty'.
```


> This function does not return the actual typeid of the target
> property. It returns the typeid specified in the type of the reference property. If the target property
> inherits from this type, it might actually have a different typeid.



### `isReferenceValid`

This method will return a boolean indicating whether the Reference contains a valid path to a property. Note that an
empty string is considered a valid reference.


## ReferenceArray and ReferenceMap

``ReferenceArray`` and ``ReferenceMap`` properties allow you to create collections of references. In both cases, under
the hood, these are arrays / maps of strings representing  paths to the referenced properties.

## Creating a ReferenceArray


You can create a ReferenceArray by setting the property’s typeid to
‘Reference’ and its context to ‘array’. For example:



```javascript
var referenceArray = PropertyFactory.create('Reference', 'array');
var typedReferenceMap = PropertyFactory.create('Reference<String>', 'map');
```

ReferenceArrays can also be included as part of a property schema:


```json

  {
    "typeid": "autodesk.test:example-1.0.0",
    "properties": [
      {"id": "ref", "typeid": "Reference", "context": "array"},
      {"id": "other", "typeid": "String"}
    ]
  }
```

## Setting references in a ReferenceArray

References can be inserted into ReferenceArrays by using your usual
array methods such as `insert` , `insertRange` , `push` , `set` ,
`setRange` , etc. and passing the referenced property or the absolute
path to said property.

For example:

```javascript
referenceArray.push('/my-absolute-path');
referenceArray.insert(0, targetProperty);
referenceArray.setRange(0, [targetProperty1, targetProperty2]);
```

Are all valid ways to add or update the references stored in the
ReferenceArray.

## Resolving References in Arrays or Maps

![Properties Collection Example](/images/reference_properties_collection_example.png)


Just like with Reference Properties, calling `get` or `resolvePath` on
a reference in an array or a map will resolve the referenced property.


For example :

```javascript
myRoot.get(['refArray', 0]);
myRoot.resolvePath('refArray[0]'); // === myProp1
```

> When calling get or resolvePath on a ReferenceArray or ReferenceMap, referenceResolutionMode and path tokens
> will not affect the outcome. For example, all of the following will resolve into the referenced property, as if no token
> or option was provided:

```javascript
referenceArray.get(["0", BaseProperty.PATH_TOKENS.REF]);
referenceArray.get(0, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
referenceArray.resolvePath("[0]*"); // == myProp1
```

### Resolving to target properties

Just like with ReferenceProperties, calling `get` or `resolvePath` on a reference array or map will, by default, return
the referenced property.

When calling `get` or `resolvePath` on a ReferenceArray or ReferenceMap, referenceResolutionMode and path tokens will
not influence the outcome (for the Reference Array / Reference Array, other parts of the resolution might be affected).

For example, the following function will all return the same property:

```javascript
referenceArray.get([0, BaseProperty.PATH_TOKENS.REF]);
referenceArray.get(0, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
referenceArray.resolvePath('[0]*');

// Will all return the same as
referenceArray.get(0);
```


To return the string path, use `getValue` :

```javascript
referenceArray.getValue(index);
```

``ReferenceMaps`` and ``ReferenceArrays`` are Primitive Collections (see explanation in :ref:`Collection Properties`).
This means, you cannot return a ``ReferenceProperty`` from a ``ReferenceArray`` or a ``ReferenceMap`` because there are
no ``ReferenceProperties`` in those arrays or maps: they contain only the path strings.

## Other methods available to ReferenceArray and ReferenceMap properties


### ``getReferenceTargetTypeid`` for Arrays and Maps


Just like with ReferenceProperty `getReferenceTargetTypeid()`, this method will return the typeid specified for a
typed reference.

For example:

```javascript
// Get the reference target typeid for typed references
var reference = PropertyFactory.create('Reference<String>', 'array');
reference.getReferenceTargetTypeid(); // === 'String'

// Get the reference target typeid for anonymous references
var anonymousReference = PropertyFactory.create('Reference', 'array');
anonymousReference.getReferenceTargetTypeid(); // === 'BaseProperty'<!-- endtab -->
```


Note that what this method returns is the type that is specified in
the typeid of this reference array / reference map and not the actual
type of the referenced object, which might inherit from that typeid.
Also note that `getReferenceTargetTypeid` does not take any parameters
and returns the typeid of the whole array / map.

### ``isReferenceValid(in_position)`` / ``isReferenceValid(in_key)``

This method will return a boolean indicating whether the path found at
the position or key specified is a valid path to a property. Note that
an empty string (pointing to ``undefined``) is a valid reference.
