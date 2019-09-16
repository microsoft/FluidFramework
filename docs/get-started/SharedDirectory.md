---
uid: SharedDirectory
---

# SharedDirectory

* Package: <xref:@microsoft/fluid-map!>
* API documentation: <xref:@microsoft/fluid-map!SharedDirectory:class>

The SharedDirectory distributed data structure is similar to a <xref:SharedMap> and can be used to store key-value
pairs. In addition to the typical Map functionality for getting, setting, and iterating over values, SharedDirectory
provides a hierarchical organization of map-like data structures as SubDirectories. The values stored within can be
accessed like a map, and the hierarchy can be navigated using path syntax. SubDirectories can be retrieved for use as
working directories.  For example:

```ts
mySharedDirectory.createSubDirectory("a").createSubDirectory("b").createSubDirectory("c").set("foo", val1);
const mySubDir = mySharedDirectory.getWorkingDirectory("/a/b/c");
mySubDir.get("foo"); // returns val1
```

It provides the same API for setting and
retrieving values that JavaScript developers are accustomed to with the
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object.

Unlike JavaScript Maps, a SharedDirectory's keys must be strings. The value can be any Object, including another
distributed data structure. Thus, you can use nested SharedDirectory and other distributed data structures to construct
a Fluid data model.

[!INCLUDE [object-serialization](../includes/object-serialization.md)]

SharedDirectory keys are *last write wins*; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the directory such that each writer writes to its own keys so
they don't overwrite each other.

## Related distributed data structures

* <xref:SharedMap>
