# Beta \| Legacy Breaks for FF Client

Beta and Legacy+Beta APIs are both used in production by partners and not settled/finalized.
They are supported under an agreement that allows them to be carefully changed ahead of major version bumps.
**New deprecations** should follow [API Deprecation](../API-Deprecation.md) leveraging the table below to schedule removal.

## Under-Development Beta entrypoints

An API may be designated **Under-Development Beta** when it needs more stability than Alpha permits but is not ready for the standard `/beta` entrypoint.
Under-Development Beta APIs follow the normal Beta breaking-change schedule but do not require advance deprecation or announcement.

This exception applies only when:

- The API is tagged `@beta`.
- The API is exported only through a documented, feature-specific `/dev/<feature>` entrypoint, such as:

    ```typescript
    import { captureVersionMark } from "@fluidframework/container-runtime/dev/version-mark";
    ```

- The API is not also available from the package root or standard `/beta` entrypoint.
- The capability is optional from a compatibility perspective: consumers must tolerate it being unavailable, and mixed-version interactions must continue to work without it.
- The API documentation states that the API is Under-Development Beta and may be changed or removed at a Beta-breaking release without advance notice.

Under-Development Beta APIs may be changed or removed at a Beta-breaking release without:

- Publishing an earlier release that marks the API as deprecated.
- Advance announcement through the Beta-break tracking process.
- Providing a replacement API or migration path.

The breaking change must still receive normal API review and be documented in a changeset and the release notes.
Partner repositories must also be checked as part of release validation.

Once an API is exported from the standard `/beta` entrypoint, this exception no longer applies and the API follows the ordinary Beta deprecation and communication process.

## To Create Issue for an **Existing** Deprecation

_ONLY_ if the API deprecation does not have an issue per [API Deprecation](../API-Deprecation.md) (preferred), use these steps to track without duplicating a lot of information.

1. Search partner repositories yourself or have Fluid Framework team member do so. See [partner info](https://eng.ms/docs/experiences-devices/opg/office-shared/fluid-framework/fluid-framework-internal/fluid-framework/docs/dev/partnerinfo/partner-info) (Microsoft internal).

1. Go to applicable issue from table:

    | Version | Conditions                                                                                                 | Tracking Issue                                                                                                                |
    | ------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
    | 3.0     | **unused** deprecations merging before 2.112 branch                                                        | [Client 3.0 Beta \| Legacy Breaking Changes · Issue #26500](https://github.com/microsoft/FluidFramework/issues/26500)         |
    | 3.10    | - used deprecations merged before 2.112 branch OR<br> - **unused** deprecations merging before 3.02 branch | [Client 3.10 Beta \| Legacy Breaking Changes · Issue #27471](https://github.com/microsoft/FluidFramework/issues/27471)        |
    | 3.20    | otherwise (used deprecations merging before 3.02 branch)                                                   | [Client 3.20 Beta \| Legacy Breaking Changes · Issue #\<not yet filed\>](https://github.com/microsoft/FluidFramework/issues/) |

    When in doubt if a `@beta` (including `@beta+@legacy`) API or pattern is in use, assume that it is in use and allow three months (12 weeks) before breaking.

1. Add sub-issue

    ![Use "Create sub-issue" button at bottom of description](../_assets/create-sub-issue.png)

1. Use `Breaking Change` template

    Note: you should only be here if the deprecation has already been published.

    ![Under "Templates and forms" select "Breaking Change"](../_assets/breaking-change-template.png)

    1. Use information in the existing release notes (or pending changeset of deprecation) to fill out the issue. Focus on conveying the change to customers.
    1. Set Assignee to whomever is expected to complete the work (ideally also a good contact for any questions)
    1. `Create` the issue.

1. Ideally associate a PR that does the removal. See [API Deprecation](../API-Deprecation.md) "Beta / Legacy staging" for steps.
