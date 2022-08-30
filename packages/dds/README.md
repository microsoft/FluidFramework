# Distributed Data Structures

Fluid's Distributed Data Structures (DDSes) packages live here.
Documentation for using them can be found [here](../../docs/content/docs/build/dds.md).

This documentation (below) is for people working on DDS implementations.
This document is incomplete and extensions to it are welcome.

## <a name="trailing-ops"></a>Trailing Ops and Compatibility

When initializing a DDS instance from an existing document, first the summary is loaded, and then any ops since that summary are applied.
These ops are called "Trailing Ops", and they can get persisted as part of the server side summarization when a session ends between summaries.
Fluid typically has no service that applies these trailing ops to the DDS.
Thus these trailing ops may remain in documents indefinitely, only being removed if a client opens, edits and re-summarizes the document.
This means DDSes should support processing all versions of ops that were ever used (in addition to supporting all past summary formats) to ensure all documents continue to be openable.
