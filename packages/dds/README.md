# Distributed Data Structures

Fluid's Distributed Data Structures (DDSes) packages live here.
Documentation for using them can be found [here](../../docs/content/docs/build/dds.md).

This documentation (below) is for people working on DDS implementations.
This document is incomplete and extensions to it are welcome.

## <a name="trailing-ops"></a>Trailing Ops and Compatibility

When initializing a DDS instance from an existing document, first the summary is loaded, and then any ops since that summary are applied.
These ops are called "Trailing Ops", and they can get persisted as part of the server side summarization when a session ends between summaries.
Since Fluid supports being used in a mode (and it typically used in this mode) where there is no service that summarizes documents to bake these trailing ops into the DDS level summaries,
these trailing ops can live in documents for unbounded amounts of time.
This means DDSes should generally support processing all past versions of ops that were ever used (in addition to supporting all past summary formats) so that old documents continue to be openable.
