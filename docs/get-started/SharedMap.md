---
uid: SharedMap
---

# SharedMap

* Package: <xref:@prague/map!>
* API documentation: <xref:@prague/map!SharedMap:class>

The SharedMap distributed data structure can be used to store key-value pairs. It provides the same API for setting and
retrieving values that JavaScript developers are accustomed to with the
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object.

Unlike JavaScript Maps, a SharedMap's keys must be strings. The value can be any Object, including another distributed
data structure. Thus, you can use nested SharedMaps and other distributed data structures to construct a Fluid data model.

[!INCLUDE [object-serialization](../includes/object-serialization.md)]

SharedMap keys are *last write wins*; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the map such that each writer writes to its own keys/maps, so
they don't overwrite each other.

## Related distributed data structures

* <xref:SharedDirectory>
