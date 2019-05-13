---
uid: SharedMap
---

# SharedMap

* Package: <xref:map>
* API documentation: <xref:map.SharedMap>

* High level description of the data structure

## Using SharedMap effectively

SharedMap keys are *last write wins*; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the map such that each writer writes to its own keys/maps, so
they don't overwrite each other.
