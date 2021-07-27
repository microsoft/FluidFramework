---
title: Schemas
menuPosition: 2
---

A *Property Sets Schema* defines the structure of a Property Set. It defines which child properties exist in a
property and which types they have.

The following example shows a possible schema for your rectangle. This example is only meant to show the various possibilities in defining schemas and is not necessarily the best way to define a rectangle.

```json
{
  "typeid": "Sample:Rectangle-1.0.0",
  "inherits": ["NamedProperty"],
  "properties": [
    { "id": "position",
      "properties": [
        { "id": "x", "typeid": "Float64" },
        { "id": "y", "typeid": "Float64" }
      ]
    },
    { "id": "size", "typeid": "Float64", "context": "array", "length": 2 },
    { "id": "fillcolor", "typeid": "Sample:Color-1.0.0" },
    { "id": "border",
      "properties": [
        { "id": "color", "typeid": "Sample:Color-1.0.0" }
        { "id": "style", "typeid": "Enum",
          "properties": [
            { "id": "solid", "value": 1 },
            { "id": "dotted", "value": 2 },
            { "id": "dashed", "value": 3 }
          ]
        }
      ]
    },
    { "id": "caption", "typeid": "String" }
  ]
}
```

Here, we've defined size as an array of 2 elements (instead of using “width” and “height” properties) to demonstrate the use of the context, array, and length keywords.


```json
{ "id": "size", "typeid": "Float64", "context": "array", "length": 2 }
```

Also, the example shows that you can define nested complex types inline, as we did for position:

```json
{ "id": "position",
  "properties": [
    { "id": "x", "typeid": "Float64" },
    { "id": "y", "typeid": "Float64" }
  ]
}
```

Or you can refer to an external schema, as we did for fillcolor.

```json
{ "id": "color", "typeid": "Sample:Color-1.0.0" }
```

The Sample:Color-1.0.0 schema could be defined this way, for example.


```json
{
  "typeid": "Sample:Color-1.0.0",
  "properties": [
    { "id": "r", "typeid": "Uint8" },
    { "id": "g", "typeid": "Uint8" },
    { "id": "b", "typeid": "Uint8" }
  ]
}
```

# Keywords

## Inheritance


This optional field allows a schema to inherit the properties/attributes of another. It is a string or array of strings containing the type identifier(s) of the schema(s) to be inherited from.

```json
"inherits": ["NamedProperty"]
```

## Sub-Properties


At any level of a schema definition, you can have various entries. One of them is properties. It is an array of property definitions. These are what we usually call sub-properties.

```json
  {
    "typeid": "Sample:Rectangle-1.0.0",
    "inherits": ["NamedProperty"],
    "properties": [
      // some properties here
      ...

      // Properties at a lower level
      { "id": "border",
        "properties": [
          { "id": "style", "typeid": "Enum",
            "properties": [
              // some properties here
            ]
          }
        ]
      },
      // other properties here
    ]
  }
```

## Sub-Property Field Name


All the entries in the properties array must be objects, and each must contain an id. This is the string that will later be used to retrieve the property to set or get its value.

## context


This identifier describes the type of collection of values the property contains. If not specified, it is assumed to be ‘single’.


Context types:

**single**
  <default> The sub-property contains a single instance of the given type.
**array**
  The sub-property contains an array of instances of the given type.
**map**
  The sub-property contains a map from strings to instances of the given type.
**set**
  The sub-property contains an unordered collection of NamedProperty.

## length

This is an optional keyword that can be used when context is ‘array’ to specify a fixed-length array. If no length is specified, the array length is dynamic.



## nnotation

This is an optional object containing extra information about the property, such as a description or links to the documentation. The content of an annotation is constrained to the schema and is never present in the Property Set or Change Set.

It is good practice to have an annotation object on every type definition, and to provide values for the following reserved properties in it.


Provide values for the following reserved properties in it:

**description**
  A string with human readable description of the property.

**doc**
  A url to the documentation page.

## default values


A property can be defined with a default value by passing it using the attribute “value”. A default can be attached to primitives, enums, strings, arrays, sets and maps.

Default values can be overridden in inherited schemas. To do that, the inherited property should keep the same 'id', 'typeid' and 'context' as the base property it overrides.

Default values of arrays, sets, and maps also support polymorphic typed entries. In other words an array of 'typeid' shape, can have items of 'typeid' square and/or circle where square and circle inherit from shape. To define polymorphic values, the attribute 'typedValue' containing a 'typeid' and 'value' is used.

```json
{
  "typeid": "Sample:Defaults-1.0.0",
  "properties": [
    { "id": "int8", "typeid": "Int8", "value": 123 },
    { "id": "string", "typeid": "String", "value": "I am a string" },
    { "id": "array", "typeid": "Int32", "value": [111, 222], "context": "array" },
    { "id": "map", "typeid": "Int32", "context": "map", "value": { "key1": 111, "key2": 222 } }
  ]
}
```

Example of overriding default values

```json
{
  "typeid": "Sample:DefaultsOverrides-1.0.0",
  "inherits": "Sample:Defaults-1.0.0",
  "properties": [
    { "id": "int8", "typeid": "Int8", "value": 56 },
    { "id": "string", "typeid": "String", "value": "I am a string updated" },
    { "id": "array", "typeid": "Int32", "value": [333], "context": "array" },
    { "id": "map", "typeid": "Int32", "context": "map", "value": { "key1": 333 } }
  ]
}
```

Example of polymorphic default values

```json
{
  "typeid": "Sample:Shape-1.0.0",
  "properties": [ { "id": "x", "typeid": "Float32", "value": 0 } ]
}

{
  "typeid": "Sample:Square-1.0.0",
  "inherits": "Sample:Shape-1.0.0",
  "properties": [ { "id": "side", "typeid": "Float32", "value": 0 } ]
}

{
  "typeid": "Sample:Space-1.0.0",
  "properties": [
    {
      "id": "arr", "typeid": "Sample:Shape-1.0.0", "context": "array",
      "typedValue": [
        { "typeid": "Sample:Square-1.0.0", "value": { "x": 110, "side": 110 } },
        { "typeid": "Sample:Shape-1.0.0", "value": { "x": 120} }
      ]
    }]
}
```

## Constants


A schema can define read-only properties through Constants. They are declared in a “constants” array which is at the same level as the properties one.

    Each constant should have an id, value and a valid typeid. The id must be unique per declared constants and properties, that is a constant and a property cannot have the same id.

    A constant can be of primitive, enum, string, array, set, map, or custom type.

    They are read only properties; values and instances can be retrieved like any other properties.
    Constants can be overridden in inherited schemas. To do that, the inherited constant should keep the same 'id', 'typeid' and 'context' as the base one it overrides.


Constants of arrays, sets, and maps also support polymorphic typed entries. In other words an array of 'typeid' shape, can have items of 'typeid' square and/or circle where square and circle inherit from shape. To define polymorphic values, the attribute 'typedValue' containing a 'typeid' and 'value' is used.

```json
{
  "typeid": "Sample:ConstantsCustomType-1.0.0",
  "properties": [
    { "id": "num", "typeid": "Uint32", "context": "array" },
    { "id": "dynamic", "properties": [
      { "id": "dynamic_string", "typeid": "String" }
    ]}
  ]
}

{
  "typeid": "Sample:Constants-1.0.0",
  "constants": [
    { "id": "int8", "typeid": "Int8", "value": 123 },
    { "id": "string", "typeid": "String", "value": "I am a string" },
    { "id": "array", "typeid": "Int32", "value": [111, 222], "context": "array" },
    { "id": "map", "typeid": "Int32", "context": "map", "value": { "key1": 111, "key2": 222 } },
    { "id": "custom", "typeid": "Sample:ConstantsCustomType-1.0.0", "value": {
      "num": [1, 2, 3], "dynamic": { "dynamic_string": "I am a string" } }
    }
  ],
  "properties": [
    { "id": "prop", "typeid": "Int8", "value": 123 }
  ]
}
```

```js
// To read constants
var instance = PropertyFactory.create("Sample:Constants-1.0.0");
instance.get("int8").getValue(); // outputs: 123
instance.get("custom").get("dynamic").get("dynamic_string").getValue(); // outputs: I am a string
```

Example of overriding constants

```json
{
  "typeid": "Sample:ConstantsOverrides-1.0.0",
  "inherits": "Sample:Constants-1.0.0",
  "constants": [
    { "id": "int8", "typeid": "Int8", "value": 56 },
    { "id": "string", "typeid": "String", "value": "I am a string updated" },
    { "id": "array", "typeid": "Int32", "value": [333], "context": "array" },
    { "id": "map", "typeid": "Int32", "context": "map", "value": { "key1": 333 } }
  ],
  "properties": [
    { "id": "prop_new", "typeid": "Int8", "value": 123 }
  ]
}
```

Example of polymorphic constants

```json
{
  "typeid": "Sample:Shape-1.0.0",
  "constants": [ { "id": "x", "typeid": "Float32", "value": 0 } ]
}

{
  "typeid": "Sample:Square-1.0.0",
  "inherits": "Sample:Shape-1.0.0",
  "constants": [ { "id": "side", "typeid": "Float32", "value": 0 } ]
}

{
  "typeid": "Sample:Space-1.0.0",
  "constants": [
    {
      "id": "arr", "typeid": "Sample:Shape-1.0.0", "context": "array",
      "typedValue": [
        { "typeid": "Sample:Square-1.0.0", "value": { "x": 110, "side": 110 } },
        { "typeid": "Sample:Shape-1.0.0", "value": { "x": 120} }
      ]
    }]
}
```

<!-- Add section on ENUMS
Add section for optional properties (are those already supported)? -->
