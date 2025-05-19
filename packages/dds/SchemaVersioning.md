This document looks at the set of requirements / assumptions in the document schema versioning space.

This document currently is targeted at an audience of DDS authors,
but it also applies to other parts of Fluid Framework that persist data,
as well as Application authors.

This document currently focuses on expressing the requirements in this area: once this is extended to include best practices and libraries for supporting those best practices, a version of this content targeted at application authors should be provided.

# Assumptions

These data formats are used to persist data in Fluid documents:

-   the snapshot format (both runtime parts and DDS specific parts).
-   op format (for trailing ops: both the runtime and DDS specific parts).
-   application data formats (how the application encodes its data in the DDS).

Collectively all of these formats will be referred to as "document schema".

This document makes the following assumptions which relate to use of these schema:

1.  Many users of Fluid Framework will use it for **non-transient** data storage (documents) that have a long (almost infinite) lifecycle.

1.  **Documents at rest need to continue to work.** Fluid service providers (including SharePoint Online and Fluid Relay Service) want to avoid converting existing documents.
    Such conversions would be very expensive (from COGS perspective), only work for online content and be somewhat risky (if something goes wrong, it’s easy to lose user data).

1.  There is no way to ship new application code (including Fluid Framework bits) instantly to all clients of a given application.
    This means every update must result in at least two "current" versions at a time for a while.

        Applications must be allowed to deploy changes safely, i.e., follow Safe Velocity principles.
        Code needs to be deployed slowly, and if something goes wrong, issues mitigated by undoing such rollout and returning to previous bits.

        Teams is a great example of this: changes go through rings of validation, where users from different rings collaborate on same files, and it may take months for changes to fully propagate through all rings and get to 99.99% saturation.

        This means old code stays in use and needs to be able to collaborate (on same doc) with new code seamlessly, at least for some amount of time.
        This window will differ depending on app and how it’s deployed – from a couple weeks for web applications, to a couple years for something like win32 Office Word.

        To support this, the application must be able to make any needed change in a way where the before and after version of the application can both be "current" at the same time.
        This means two different "current" versions must be able to have different Fluid Framework versions.

1.  Collaboration between users should work as long as they have a version of the application that is "current" for a definition of "current" controlled by the application authors (not the Fluid Framework authors!).
    This includes cross-client collaboration between multiple current versions of the application with different Fluid Framework versions noted above.

1.  Documents can be read-only for some users, thus in-place conversion is not possible for all clients.

# Requirements

The above assumptions imply the following requirements for changes in document schema:

1.  Service based format conversions should never be required.

1.  Applications (including Fluid Framework bits) must support reading all formats that have ever been written.

1.  Any changes in document schema must ship dark (default to not being used for writing) and be rolled out (enabling new format) on a schedule controlled by the team controlling the application deployment schedule.

    Writing new formats can only be enabled by an application once its authors confirm nearly 100% of clients have code capable of collaborating with new schema (or it’s OK for old clients to fail in some controlled way). Please see remark below about 100% being hard to reach.

1.  When a new format is added, support for writing the previous format must available in the same version that has support for the new format. (This is implied by the above, and is called out separately for clarity).

# Best Practices

Here are some patterns to follow to meet the above requirements while optimizing for maintainability and user experience.

## General

Both libraries and applications can use these.

-   Update data to new formats lazily (when the data would be rewritten anyway).
    This approach has several benefits over eager updating:

    1. Works with no special handling for readonly clients.
    1. Avoids new formats causing write amplification.
    1. Keeps provenance metadata (like who edited the content most recently) accurate.
    1. Reduces the impact of compatibility issues.
       For example just opening a document in one client will never break it for another.
       This also reduces the amount of damage caused by a bad update before it can be rolled back.

-   Always check for unsupported formats, and report recoverable errors including what the format is that is not supported.
    Libraries should make it as easy as possible for applications to expose this error to the users so they can ideally update the application and continue without data-loss.
    However the case where updating the application does not solve the issue should be handled as well: ensure no data corruption can occur due to unexpected formats being encountered as well as that if data corruption did occur and made a format appear unrecognized, that telemetry could detect the issue.

-   Keep the contents of persisted data formats out of public APIs.

    Since APIs have different compatibility requirements than persisted data formats, mixing the two will result in reduced evolvability long term.
    This avoids the complexity related to supporting reading and writing multiple formats from cluttering the APIs.

-   Implement support for persisted formats in a self contained way, where the relevant code is clearly marked.

    A type which is persisted has very different evolvability than one that is not.
    For example a package that has a non-exported interface usually can do a rename refactoring for members of the interface, but if that interface is used for Json serialized objects which are persisted,
    the change could easily break support for all existing documents and/or collaboration with all existing clients, and do so in a way that won't show up in code review since the persistence/format logic might be untouched.
    Instead any code which defines a persisted format (including interfaces used with Json) should be clearly documented as such.
    An easy way to do this by putting persisted related details in a clearly named file (for example persisted_formats.ts),
    and not importing anything into that file which could change and result in a changed data format (for example don't import any types to include in Json serialized data).
    If necessary duplicate types, or move the source of truth to the persisted format code.

-   Factor legacy format reading code (code for reading formats old enough that writing them is not supported) into compatibility libraries which can be authored as converters.

    This approach ensures that the only unbounded code growth from having a very old codebase with many legacy formats (support for reading all old formats) is organized in a way that its complexity does not increase as more formats are added, and it has no maintainability impact on other parts of the code.

## Libraries

This includes Fluid Framework, as well other libraries consumed by Fluid applications.

-   Adding support for writing a new format can be done in a minor version, but it must not be used unless opted into by the application or by editing a document already using the new format.

    When adding a new format, the APIs to opt into that format should explicitly document the oldest version in which that format is supported, so that when applications consider opting into it, they can know if it is safe for them to do so.

    If the format is not yet stable (current version of it will not be supported for reading in all future versions), it must be explicitly documented as such,
    and ideally should not be included in any releases unless required for some transient use cases that do not require supporting persisted data across versions.
    A good way to do this is to indicate that the format is not stable in the version itself, for example by naming the version something like `4-Unstable-Development` (this applies to the version string written into the persisted data as well as the version name in the API).
    When the format is stabilized a new version should be used to ensure any data encoded while the format was unstable will not be parsed as if it was in the final format.
    As a third line of defense (after not including unstable formats in the API and clearly marking them as unstable), actually persisting data in an unstable format should error before writing the data unless explicitly opting into allowing persisting unstable formats, which should only be possible using internal testing APIs.

-   Explicitly require users of the library to select the default write format.

    Changing the default format for writing is a breaking change, and can only be done with a major version bump.
    However if this default is part of the library, and not specified through the API, the developer updating the application might not be aware of the change and its implications (requiring that support for the new format is fully deployed already).

    Explicitly specifying the format as part of the API makes sure that an update which removes support for writing the format the application is using will cause a build error, and gives a clear location for where documentation about write formats and compatibility can be found for such a user (On the API that accepts the write format).
    Typically the application author will want to delay the update and instead first deploy and fully roll out an update to a newer write format.
    If the application was multiple major versions behind, its possible they might need to update piecewise, and the need to do this (and the impact of not doing it) can be clear in the API in a way they can't accidentally miss like they could if it was just in the release notes for some of the intermediate versions.

    One way this can be simplified for large sets of packages or packages with many formats to update is to treat the major version like the format version, and require users of the libraries to have fully deployed each previous major version before updating to the next to avoid incompatibilities.
    This model risks the application authors not knowing about the pattern, so it requires clear communication of the approach.

-   Removal of support for writing a format is a breaking change, and can only be done with a major version bump.

    Since updating to a new format requires a full rollout (sometimes two if the format is not supported in the currently deployed version), and the library does not control this schedule,
    dropping support for a format needs to be communicated to users of the library well in advance (more so than a simple API break that has no rollout requirements).
    For Fluid Framework this means announcing the deprecation of the format as part of the major release before the one where it is removed.

## Applications

-   Applications should opt into writing new data formats only once support for those formats has been fully deployed.
    This includes enough testing to be confident they won't need to roll back to a version without the support.
-   In most case it's almost impossible to get to 100% saturation of newly deployed application version, even years after deployment. There almost always would be a client who run an application version 2 years ago, closed a lid of laptop and reopened it just now. While application (and FluidFramework) can attempt its best to shut down such old versions of application / session / FluidFramework, all such attempts would race with this client attempting to reconnect back to document, send and receive ops that it might not understand due to changes in document schema.
      - For that reason, it's extremely important to build a framework (upfront) that could fail in very predictable way when application (and libraries) find themselves dealing with unknown format.
-   When updating to a new major version of a library (such as Fluid), check the release notes for current or upcoming format changes, and schedule format updates accordingly.

# Complications

It’s worth discussing what happens if we do not follow these rules.
A couple examples:

## Deprecating DDS

Say we decide to deprecate some DDS and eventually remove it from the code base.
Clients who rely on this DDS will be stuck, and have one of these options:

1. Stay forever on old versions of Fluid Framework.
2. Copy DDS code into their repo and continue to support it the way it’s described at the beginning of the document.

It’s a possibility, but it’s very inefficient if many customers depend on it, then I’d argue it’s better to push it to separate repo for partners to share cost of supporting it.
The obvious next step – we continue to support it, which is not much different form having it in our repo under “legacy” bucket.

Note that this workflow does not work with other changes, like changes in snapshot format.

## On-the fly converters

In some distant future, we may offer a converter workflow, where (for example) a Directory DDS can be morphed transparently into a SharedTree DDS on open / first edit (and the API does not expose the Directory DDS at all), including any trailing ops.
Based on the assumptions above, we will need to deploy such changes dark and eventually trigger conversion.
Due to offline clients having local changes in the old format, we will need to deal with merging ops in the old and new formats.
Given that in general, better support for offline will require addition of 3-way merge, we are likely to rely on 3-way merge to deal with these changes (it simplifies certain aspects of conversion, but requires more expensive, but more generic merge tooling).

While we did not think through designs here, I think it’s safe to say that we will not have these flows in production for next 2+ years.

# Appendix

Shared Tree resources:

[Experimental SharedTree's Breaking-Change-Migration.md](../../experimental/dds/tree/docs/Breaking-Change-Migration.md)

[SharedTree's "Stored and View Schema.md"](./tree/src/schema-stored/Stored%20and%20View%20Schema.md)

[SharedTree's `schemaEvolutionExamples.spec.ts`](./tree/src/test/feature-libraries/modular-schema/schemaEvolutionExamples.spec.ts#L98)
