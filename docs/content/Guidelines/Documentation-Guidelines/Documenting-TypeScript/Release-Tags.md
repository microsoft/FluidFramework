# Release Tags

Release tags are [TSDoc Modifier tags](./TSDoc-Guidelines.md#modifier-tags) that can be used to explicitly denote the stability guarantees associated with an API and who should be using it.
Each release tag has its own associated stability guarantees that dictate when and how [breaking changes](https://github.com/microsoft/FluidFramework/wiki/Breaking-vs-Non-breaking-Changes) are permitted.

Each exported API has exactly one release tag, optionally paired with the [@legacy](#legacy) tag.

> [!IMPORTANT]
> There are [other modifier tags used in exported APIs](./TSDoc-Guidelines.md#modifier-tags) which are not "release tags" but which communicate important information to the consumer of the API.
> Some of these (for example [`@sealed`](./TSDoc-Guidelines.md#sealed), [`@input`](./TSDoc-Guidelines.md#input), and [`@system`](./TSDoc-Guidelines.md#system)) express additional restrictions or expectations around how an API will be used and how it might change across versions.

> Please ensure you have examined and understand all the tags present on an API before using it.

# [@public](https://api-extractor.com/pages/tsdoc/tag_public/)

APIs tagged with `@public` are APIs that are suitable for general, production use.
We guarantee full [SemVer](https://semver.org/) compliance for these APIs, unless they are also tagged with [`@sealed`](./TSDoc-Guidelines.md#sealed), [`@input`](./TSDoc-Guidelines.md#input), or [`@system`](./TSDoc-Guidelines.md#system), in which case there are additional restrictions around their use.

## Guidance

APIs should be marked as `@public` when we believe they are stable and ready for production use.
Modifications to _public_ APIs are subject to [SemVer](https://semver.org/) compliance, meaning that breaking changes are only permitted in `major` releases.

> [!NOTE]
> See [Breaking vs Non-breaking Changes](https://github.com/microsoft/FluidFramework/wiki/Breaking-vs-Non-breaking-Changes) for more details about these stability guarantees.

Pull requests (PRs) adding or modifying existing _public_ APIs, as well as PRs promoting APIs from another release tag to `@public` are subject to extra review scrutiny.

## Stability Guarantees

We guarantee full [SemVer](https://semver.org/) compliance.
Any deviation from this is a bug.

# [@beta](https://api-extractor.com/pages/tsdoc/tag_beta/)

APIs tagged with `@beta` are APIs for which we are actively seeking feedback, and for which we believe there is a path towards public availability.
Customers are encouraged to try it and provide feedback.
_Beta_ APIs may be used in production scenarios, but with caution.
See our stability guarantees below.

## Guidance

An API should generally only be marked as `@beta` as a part of an agreed-upon product plan including direct customer engagement to help evaluate the API in preparation for eventual promotion to `@public`.
Modifications to _beta_ APIs are subject to a custom support guarantee we have made that breaking changes are only permitted in `minor` releases that are an increment of 10.

> [!NOTE]
> See [Breaking vs Non-breaking Changes](https://github.com/microsoft/FluidFramework/wiki/Breaking-vs-Non-breaking-Changes) for more details about these stability guarantees.

## Stability Guarantees

We guarantee that we will not introduce _beta_ API breaking changes except in `major` version increments, and `minor` version increments that are an increment of 10.
For this reason, users of these APIs should either pin associate package dependencies (e.g. `"fluid-framework": "2.0.0"`) or bind them to a range that ensures they will not accidentally pick up breaking changes (e.g., `"fluid-framework": ">=2.0.0 <2.1.0"`).

# [@alpha](https://api-extractor.com/pages/tsdoc/tag_alpha/)

APIs tagged with `@alpha` are APIs for which we are actively seeking early feedback.
Customers are welcome to try it and provide feedback.
However, _alpha_ APIs should NOT be used in production, because they will likely be changed and may even be removed in a future version.

> [!WARNING]
> We make no stability guarantees whatsoever for `@alpha` API members.

## Guidance

An API should generally be marked as `@alpha` when part of an experiment.
It should be part of an agreed-upon plan including direct customer engagement to help evaluate the API in preparation for eventual promotion to `@beta` or removal.

## Stability Guarantees

We do not make any stability guarantees for `@alpha` APIs.
For this reason, they should not be used in production scenarios.

# @legacy

`@legacy` is a custom tag for APIs that were in use during Fluid Framework v1.x and remain supported while use is migrated away.

## Guidance

An API should generally only be marked as `@legacy` if it is referenced by an existing `@legacy` API (i.e. when `api-extractor` reports that you forgot to export it), or as needed to otherwise fulfill our support commitment to our partners.

# [@internal](https://api-extractor.com/pages/tsdoc/tag_internal/)

We reserve the `@internal` tag to denote APIs that are only intended for use within the Fluid Framework repository.
In the future, we will begin omitting these APIs from our published packages altogether to ensure they are not visible to external consumers.

## Guidance

APIs should be marked as `@internal` if they **are not** intended for external consumption but need to be shared between packages within the Fluid Framework repository.

When considering if an API should be surfaced as `@internal` consider the following:

- Does it really need to be exposed at all?
  Do multiple packages in our repo need access to it?
  If not, consider making the API private to only the package that needs it.

## Stability Guarantees

> [!WARNING]
> We make no stability guarantees whatsoever for `@internal` or untagged API members.
> Such APIs should never be used outside of the Fluid Framework repository.
