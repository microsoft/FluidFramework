# change-family

Abstraction for change families.

A change family is a collection of types of changes which can be used within a document, and support for building, serializing and rebasing them over each-other.
This includes things like policies for how to edit sequences, clearing optional fields, swapping trees, updating counters, schema editing etc.

A change family has to handle all its supported changes identically between all clients, and across all versions.
Support for new kinds of changes can be added, but updating applications to use the new changes must be done carefully to avoid breaking old clients.

Applications that only have ephemeral sessions and never persist documents with [trailing ops](../../../README.md#trailing-ops) may be able to relax this constraint somewhat.

A change family can even include domain or application specific change types,
though those are typically instead decomposed into simpler changes to avoid the above stability constraint for such high level concepts.
