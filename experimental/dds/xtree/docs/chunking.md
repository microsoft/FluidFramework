# Chunking
A naive and not-yet-efficient serialization format that fills chunks of a predetermined
size by writing from the head and the tail:

```
             head-.      .-tail
                  v      v
  +----------------------------------------+
  |  structure    | .... | strings/numbers |
  +----------------------------------------+
```

When the head/tail intersect, the chunk is full.

Pointers to string/number data in the tail are encoded as an offset from the end of the
chunk, allowing space to be inserted/removed from the middle without rewriting pointers.

# Encoding

## Literals

Each literal is encoded as a 64b 'value records'. Each 'value record' begins with a bit prefix that
indicates the value's type. If the value is sufficiently small, it is stored inline using the remaining
bits in the record. For larger values, the remaining bits indicate the offset at which the string/number
is stored.

Note that for larger strings and numbers, the offset can point to any position in the chunk, allowing
larger string and numbers to be interned.  Also note that because the record for larger strings specifies
both the starting offset and length, strings like "point" may be encoded as a subset of "points".

Type               | Format                           | Description
-------------------|----------------------------------|----------------------------------
Null               | `<Type>`                         |
Boolean            | `<Type, true | false>`           | The true/false value is inlined
InlineNumber       | `<Type, value>`                  | Most numeric values can be inlined
Number             | `<Type, offset>`                 | Remaining 8B numeric values stored indicated offset
InlineString       | `<Type, length, value>`          | Short strings are inlined as UTF-8
String             | `<Type, length, offset>`         | Longer strings stored at indicated offset

BTW - The above table shows only JSON types out of laziness, assuming the extension for the remaining literals
are trivial.  There are some additional types (like node references) that I haven't yet thought about.

## Arrays
The 'value record' for an Array contains the array 'length' and the offset at which the array's contents
are stored.  The array's contents is encoded list of 'length' consecutive 'value records' that correspond
to the array values beginning at index 0.

Note that because 'value records' are a fixed length of 64b, it is possible to read subsets of the
array without decoding all of the array contents.

```
                             ,---------------.
                            |                 v
<Type: Array, length: 2, offset>             <Type: Number, value> <Type: Number, value>
                                                        0                    1
```

## Objects
The 'value record' for an Object contains the number of keys as 'length' and the offset at which the
object's keys and values are stored.  The objects's keys are encoded as a binary searchable list of 'length'
consecutive 'string records' in ascending order.  The list of keys is followed by a list of 'length' consecutive
'value records' corresponding to the object's property values.

```
                             ,---------------.
                            |                 v
<Type: Array, length: 2, offset>             <Type: String, ..> <Type: String, ..> <Type: ..> <Type: ..>
                                                   key 0              key 1         value 0    value 1
```

# Notes

Before interning or inlining, data expands ~2x and sometimes more (e.g., the number '0' is 1B in JSON, but 16B in this format due to the 8B record pointing to the 8B F64).

I'll try some smaller record sizes before implementing the inlining/interning, as I'd like to rely less on the data conforming to favorable patterns.
