---
title: TypeIds
menuPosition: 3
---

The property types are identified via a *typeid*. Typeids are used to instantiate a property of a specific type, to
refer to this property type in a schema and they are also stored in the data model to enable application to implement
behaviors that depend on the type of the data. Primitive Properties and Reserved Properties have unique typeids which
are defined by Property DDS. Users defined types can be created by creating a schema for the type and registering it under a
specific typeid. To prevent naming conflicts between multiple applications, each user defined typeid is assigned to a
*namespace*. Allowed characters in namespace and type fields are uppercase and lowercase alphabet letters (a-z, A-Z),
digits (0-9) and the dot (.). Additionally, to facilitate migration and interoperability between different versions
of applications, each typeid contains a version.

A typeid for a user-defined type therefore has the following structure:

``<namespace>:<typename>-<version>``

An example for a such typeid is ``shape:circle-1.0.0``.

The version numbers in the typeid must follow the `Semantic Versioning <https://semver.org/>`_ conventions, i.e. having
the structure ``<major>.<minor>.<patch>``. If only :ref:`annotations<annotation>` in a schema are changed, the patch
version is incremented. If new properties are added, the minor version is incremented and if an existing property is
removed or its type is changed, a new major version has to be assigned. Once a schema with a given version has been
registered in a branch, it is no longer possible to remove or modify it. Instead, if it is necessary to update or
modify the schema, a new version of the schema has to be registered. This is necessary because Property DDS stores the
full history of the data in the commit graph, and the schema is needed to interpret the data in the old commits
of the branch.
