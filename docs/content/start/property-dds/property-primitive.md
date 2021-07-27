---
title: Primitive Properties
menuPosition: 4
---

The actual data in PropertySet is stored in the leaf nodes of the tree. Those are called **Primitive Properties**.
Primitive Properties are strictly typed and can have on of the following types:




|    Typeid     |  Description  |
|---------------|---------------|
| **Float32**   |   A 32 bit floating point value (according to IEEE 754) |
| **Float64**   |  A 64 bit floating point value (according to IEEE 754) |
| **Int8**      | A signed 8 bit integer value (with a valid range from −128 to 127) |
| **Uint8**     | An unsigned 8 bit integer value (with a valid range from 0 to 255) |
| **Int16**     | A signed 16 bit integer value (with a valid range from −32768 to 32767) |
| **Uint16**    | An unsigned 16 bit integer value (with a valid range from 0 to 65536) |
| **Int32**     | A signed 32 bit integer value (with a valid range from −2,147,483,648 to 2,147,483,647) |
| **Uint32**    | An unsigned 32 bit integer value (with a valid range from 0 to 4,294,967,295) |
| **Int64**     | A signed 64 bit integer value (with a valid range from -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807) |
| **Uint64**    | An unsigned 64 bit integer value (with a valid range from 0 to 18,446,744,073,709,551,615) |
| **Bool**      | A boolean value, either true or false |
| **String**    | A Unicode string |
| **Reference** | A reference to another property. It is a string that must contain a path. See Reference Properties |
| **Enum**      | An enumeration. It is a type whose value is restricted to a range of predefined values |


The stored data in a primitive property can be accessed via the ``getValue`` and ``setValue`` methods of the
Property object.

```javascript
// Create a Float64 property
let float64Property = PropertyFactory.create('Float64', undefined, 10);

// Get the value of the property
let value = float64Property.getValue();       // === 10

// Set the property to a new value
float64Property.setValue(20);
let value2 = float64Property.getValue();      // === 20

// The supplied value will be casted to a valid value if necessary
let int32Property =PropertyFactory.create('Int32');
int32Property.setValue(2.3);
let intValue = int32Property.getValue();      // === 2

// The Int64 type requires special treatment in JavaScript, since there is
// no inbuilt 64 bit integer type in JavaScript
let int64Property = PropertyFactory.create('Int64');

// Set the lower and higher 32 bits of the Int64 property
int64Property.setValueLow(10);
int64Property.setValueHigh(20);

// Get the lower and higher 32 bits of the Int64 property
let low = int64Property.getValueLow();        // === 10
let high = int64Property.getValueHigh();      // === 20
```

There are three special types of primitive properties:

**Reference Properties**
  These are used to store a path, which points to another property in the PropertySet. For more details please see the
  section [Paths and References]({{< ref "property-paths-references.md" >}}).

**Enum Properties**
  An enum is restricted to a set of predefined named values, which are defined in schema that describes the enum.

**String Properties**
  String properties support OT. TBD
