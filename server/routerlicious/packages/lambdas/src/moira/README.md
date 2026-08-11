# Moira Submitter Lambda

This lambda submits ordered operations into Moira Service.
Only ops related to PropertyDDS are processed.

Each operation contains a `ChangeSet` - a data structure that describes changes happened within a tree structure within PropertyDDS.
There changes are expressed in form of `insert`, `modify` and `remove` sections. Each section can appear at most once.
Each changeSet can contains several changes at each section, inserting, modifying and/or removing multiple nodes within dds.

By submitting those changes to Moira Service enables tracking a history of changes and accessing data view at any point in time.
This way new joining clients can request up-to-date PropertyDDS state, while re-joining or outdated clients obtain necessary data to catch up.

Each PropertyDDS is represented as an independent branch within Moira.
During submission, lambda will create a corresponding branch if it doesn't exist.

Each changeSet with additional metadata will be stored as a commit (sounds like git, doesn't it?) on corresponding branch.
