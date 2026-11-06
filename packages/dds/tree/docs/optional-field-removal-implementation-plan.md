# Implementation plan: Compose schema upgrades while preserving stored permissions

## Status and scope

Implementation is proceeding in reviewed slices.
The first slice is complete: the internal `getSchemaUpgradeCandidate` target builder and focused unit tests are implemented.
The live integration slice is also complete: compatibility checks and schema upgrades use the same candidate builder and configured staged policy.
The directly coupled snapshot and offline compatibility checks are updated, and all existing user-story scenarios pass.
The snapshot collaboration-policy follow-up accepts direct viewing or a safe upgrade in both directions.
The composition slice now preserves allowed types and supported staged optionality at each schema location.
The alpha `includeAlreadyEnabledUpgrades` flag and token-wide preservation helpers are removed.
The alpha diagnostic API and remaining documentation and API delivery work are still planned.
Track completion in the task list in section 8.

The initial exploration used [commit `9596537`][baseline] on the optional-field-removal branch.
The plan was checked again against [main at `75902eb`][main-baseline] when merging upstream changes.
Source-code links are absolute GitHub links pinned to the relevant investigation revision.
Document links follow the feature branch so they refer to the current plans after publication.

This document owns the algorithms, diagnostic contracts, specific code changes, and implementation-level validation for schema upgrades and compatibility.
The [work plan][work-plan] owns the requirements, user-facing test scenarios, and delivery checklist.
The [overview][overview] describes the application-facing behavior.

Use the work plan's [required behavior][requirements] and [compatibility expectations][compatibility-expectations] as the acceptance requirements.
The new alpha informational diagnostic, `compatibility.retainedUnknownOptionalFields`, is specified in section 4.

## 1. Findings before implementation

| Area | Behavior before this feature | Required change |
| --- | --- | --- |
| [Stored-schema conversion][conversion] | `toUpgradeSchema` derives its result from the view schema and staged policy only. It does not consider the existing stored schema. | Use a shared builder that composes both schemas with the additions selected by the configured staged-upgrade policy. |
| [Compatibility calculation][compatibility] | `canUpgrade` compares the existing stored schema against that view-only target. | Compare against the target that retains eligible unknown fields. Return the new information separately from blocking discrepancies. |
| [Upgrade execution][runtime-upgrade] | `upgradeSchema` independently derives the view-only target and rejects field removal. | Use the same target builder as the compatibility checker. |
| [Viewing discrepancies][discrepancies] | Unknown optional fields are already tolerated when the view object enables the option. | Keep that rule. Do not turn retained fields into viewing errors. |
| [Stored-schema comparison][comparison] | Upgrades must satisfy the superset rules for the root and all existing node definitions. | Keep these safety rules unchanged. |
| [Live compatibility updates][live-status] | A stored-schema change recomputes compatibility and forwards its result to the view. | Include and refresh the new informational property through this path. |
| [Snapshot comparison][snapshot-comparison] | The helper asserts that equivalence is symmetric between two view configurations. | Remove that assumption and update documentation accordingly. |
| [Persisted-schema comparison][persisted-schema] | The offline helper calls the shared compatibility checker. | Inherit the new upgrade decisions and verify agreement with live views. |
| [Object schema options][factory-options] | Unknown optional fields are now allowed by default. Factory settings and per-schema options can override the default. | Use the resolved view option; strict negative tests must explicitly set it to `false`. |
| [Unknown-field inspection][unknown-field-schemas] | The alpha context already exposes stored definitions of unknown optional fields. | Keep that inspection API distinct from the proposed upgrade-target report; see section 4.4. |

The root cause is target construction, not the general definition of a safe stored-schema upgrade.
The previous view-only target omitted fields that the application no longer declared.
The superset check correctly rejected that target.

The original optional-field slice did not solve the same issue for declared fields with staged permissions.
A restrictive policy could generate a candidate that excluded already-enabled types or optionality; the upgrade was rejected rather than removing those permissions.
Setting `includeAlreadyEnabledUpgrades` expanded any enabled or partially enabled token across all its locations.
The composition slice replaces that mechanism with per-location preservation without enabling new locations merely because they share a token.

## 2. Shared upgrade-target construction

### 2.1 Internal interface

Extend the implemented internal helper, `getSchemaUpgradeCandidate`, alongside the root conversion functions in [treeSchema.ts][conversion].
The functions `toStoredSchema`, `toInitialSchema`, and `toUpgradeSchema` moved there on main.
Reuse the lower-level transformations that remain in [toStoredSchema.ts][conversion-transforms].
Expose it through the package-internal [simple-tree barrel][simple-tree-index] for the live upgrade path.
Do not add it to the customer-facing entry points.

Inputs:

- The complete `TreeSchema` for the view.
- The existing `TreeStoredSchema`.
- The configured `StagedSchemaUpgradePolicy`, which selects new permissions rather than deciding whether to preserve existing ones.

Use the complete `TreeSchema`, which includes the root field and all reachable view definitions.
A single node schema does not describe root optionality or root-level unions.

These inputs are sufficient to determine the target.
The helper is a pure schema operation: it does not inspect document content or require a tree instance, checkout, or runtime.
Retaining a field must not depend on whether any node currently contains a value for it.
Preserving allowed types and optionality must likewise depend on stored permissions, not on whether current content uses them.

Outputs:

- The proposed `TreeStoredSchema`.
- A list of retained optional field locations.

The proposed schema is a complete candidate stored schema, not a patch or an executable upgrade object.
The helper does not apply the upgrade or guarantee that the candidate passes the upgrade checks.
Its callers validate the candidate before applying it.
Both the stored-schema superset check and compatibility of the view with the candidate are required.

Both compatibility calculation and upgrade execution must use this helper.
Return the diagnostic locations from the same construction pass so the report describes what the target actually retains.

Keep the existing view-only conversion available.
Initialization and extraction derive their result from the view schema and policy without using an existing stored schema.
They must not receive retained historical fields.

### 2.2 Construction rules

Convert the view schema to its stored representation before combining or comparing schema structures.
Keep the original view schema available to determine which objects permit unknown optional fields and to resolve view-known types excluded by staging.

Perform field and allowed-type composition and the final stored-schema upgrade checks on stored-schema representations.
The original view supplies the policy and declaration information that conversion does not preserve.
Section 2.4 describes how this applies to staged declarations.

1. Generate the view-only stored-schema candidate using the configured policy.
2. Copy maps that need modification; never alter the cached conversion or the supplied stored schema.
3. Compose the root field and matching fields of each node with their existing stored counterparts.
4. At each matching field location, retain its stored allowed types and add allowed types selected by the view's policy.
5. Retain an existing optional kind when the view field supports optional content, including through staged optionality, even if the configured policy does not enable new optionality.
6. For a view object that enables `allowUnknownOptionalFields`, retain stored optional fields whose stored keys are absent from the view.
7. Preserve each retained unknown field's allowed types and persisted metadata.
8. Process all type references required by the composed root and node fields, including definitions excluded by the initial staged conversion.
9. Process each node identifier once, following recursive references without repeatedly expanding the same definition.
10. Return the complete candidate and retained-field locations; leave final upgrade and view-compatibility validation to callers.

Use the same field-composition rules for root fields, object fields, map values, and array elements.
A type's existence elsewhere in the schema does not mean that it is already allowed at the field being processed.
Identify object fields by node identifier and stored key; root, map, and array locations must keep their existing field semantics.

Use the resolved `allowUnknownOptionalFields` value from the view object, not the presence of an explicitly supplied option.
The factory now defaults this value to `true`, and applications can override it at factory or object scope.

Check the view node kind, not only the stored node class.
Arrays also use `ObjectNodeStoredSchema`, but they do not opt into unknown object fields.

Match fields by stored key.
A different application property name with the same stored key identifies the same field.
It must not produce an extra retained-field entry.

Adding a stored type to a declared field's candidate does not grant the view support for that type.
For example, composing stored `number | string` with a strict `number` view must not make `canUpgrade` true: the candidate still permits strings that the view cannot read.
Composing the same stored field with `number | staged(string)` can be accepted because the view supports both types.
Similarly, a strictly required view field must not be made compatible with a stored optional field unless the view supports optional content.
Keep rejecting required-field removal, incompatible node kinds, and conflicting definitions under the same stored identifier.

### 2.3 Referenced node definitions

When a required type is not already in the generated target:

- If the complete view schema knows the identifier, derive its current definition and compose its field permissions with the matching stored definition.
- Otherwise, retain its existing stored definition.
- Continue through its field references, including references in arrays and maps.
- Process each identifier once so recursive definitions terminate.

A missing stored definition represents a type that permits no nodes in the current low-level model.
Preserve such a reference without inventing a stored definition or treating it as proof of corruption.
If the view supplies a definition for that identifier, normal conversion and upgrade checks still apply.

Union allowed types only at corresponding field locations, not across unrelated fields.
Do not use the historical definition of a view-known type to hide conflicts in the view's current declaration.
Changes inside that type must undergo the same composition and validation as other view-known definitions.

The final repository-wide superset check remains mandatory.
It includes node definitions that can be used by detached content, even if they are not reachable from the document root.
Do not add a root-reachability pruning rule.
If a definition outside the retained reference set would be lost, keep the existing upgrade rejection rather than silently deleting it.

### 2.4 Staged declarations and per-location preservation

The complete [TreeSchema definitions][tree-schema] and the generated stored definitions are not interchangeable.
The generated target excludes types reachable only through disabled staged declarations.

A retained field or retained allowed type can refer to one of those excluded definitions.
If the view knows that type, use its current declaration.
Do not copy the historical definition solely because the type was absent from the initial generated target.
Otherwise, an incompatible staged declaration could be hidden from the upgrade check.

Preserve permissions at each stored location regardless of whether the view stages them or the policy currently enables them.
For a compatible field, its candidate allowed types are the union of the stored types at that location and the view types selected by the configured policy.
For staged optionality, preserve the permission to omit a field only where that permission already exists, or introduce it where the configured policy enables it.
Preservation must not make a new location optional simply because another field sharing the token is optional.

For example, the same staged string token is declared on `Task.primaryPriority` and `Task.fallbackPriority`.
Stored schema permits strings only at `primaryPriority`.
With the restrictive policy, the candidate preserves strings there but does not add them at `fallbackPriority`.
The token remains `partial`.
If the policy explicitly enables that token, both locations can allow strings, subject to the normal validation checks.
Apply the same distinction to partially enabled staged-optional tokens.

Preserving a definition must not enable a staged allowed type at another location.
Likewise, restoring an omitted optional field must not advance any unrelated staged rollout.
The enabled-upgrade status is a report of the stored schema, not a token-wide instruction to enable changes elsewhere.

#### Remove the alpha preservation flag

The composition slice removes `includeAlreadyEnabledUpgrades` from `StagedSchemaUpgradePolicy`.
Do not replace it with a new flag or merely hardcode its previous behavior to `true`.
Its previous implementation treated both `partial` and `enabled` statuses as permission to include the token everywhere; that differs from the implemented location-specific behavior.

Remove `getEffectiveStagedUpgradePolicy` and its package-internal exports once both callers obtain preservation through candidate construction.
Remove or simplify the view's corresponding `effectiveUpgradePolicy` wrapper rather than retaining a misleading token-wide policy path.
Audit all flag references in configuration, tests, documentation, and generated API surfaces.
Include the view-only conversion tests, compatibility tests, and live staged-upgrade tests; remove obsolete policy properties without changing initialization semantics.
Keep `includeStaged` and `includeStagedOptional` for explicitly enabling new permissions.
Update restrictive, permissive, and selected-token policy documentation to distinguish initialization from upgrades of existing documents.

Compatibility and live execution must pass the same configured policy and stored schema into the shared builder.
Continue computing staged-upgrade statuses for the existing query APIs, including `partial`; do not use that aggregate map to drive preservation.
Keep schema identity hashing based on the configured view and policy, not on per-document retained permissions.

See [staged-upgrade policies][staged-policy].

### 2.5 Mutation and caching

Root conversion results now belong to `RootSchemaDerivedData` in [treeSchema.ts][tree-schema].
Roots with staging cache results by policy identity; roots without staging share one result across policies.
Complete view definitions can also be shared across roots through schema components.
Never mutate a cached result, the view definitions, or the supplied stored schema.

Reuse the complete graph already available through the view configuration or `getRootSchemaDerivedData`.
Do not rebuild that graph or attach stored-schema-specific retained fields to its shared caches.
Definition iteration order is unspecified, so sort diagnostic output explicitly.

Copy maps that need modification.
Reuse immutable stored field and node definitions where possible.
Preserve stored-only node metadata.
Keep the existing conversion behavior for metadata on view-known definitions.

Initially, build the result from both schemas and the configured policy on demand.
Do not cache it only by mutable repository identity.
The same repository can change, and one view configuration can be used with different stored schemas.

## 3. Compatibility and upgrade execution

### 3.1 Compatibility flags

Keep `canView` based on discrepancies against the current stored schema.
Continue to collect staged-upgrade status even when viewing is blocked.

Use the shared target for:

- `canUpgrade`: the composed target passes the existing stored-schema superset rules and supports read/write access through the requesting view.
- `isEquivalent`: the view can already access the document, and the proposed upgrade target is equivalent to the document's current stored schema under the schema upgrade rules.

Keep the `isEquivalent` name and update its public documentation to make these semantics explicit:

- The comparison is between the document's current stored schema and the composed target, including retained fields, allowed types, optionality, and the additions selected by the configured staged-upgrade policy.
- Both must permit an upgrade to the other under the existing rules. The reverse check establishes equivalence; it does not perform a downgrade.
- A `true` result also requires `canView` to be true. It implies `canUpgrade` is true and `upgradeSchema()` will make no stored-schema change.
- It does not require identical serialized schemas. Metadata differences ignored by the upgrade checks do not affect the result.
- It does not mean that initialization with this view would produce the same schema, or that different application versions can view each other's documents.
- A `false` result alone does not mean that viewing or upgrading is forbidden. Applications must use `canView` and `canUpgrade` for those decisions.

These calculations implement the work plan's [compatibility expectations][compatibility-expectations].
After a successful upgrade, the resulting stored schema must support viewing.
Test that postcondition as well as the superset condition.

`canUpgrade` is not a request to make the stored schema match the view-only conversion.
It answers whether the composed candidate preserves existing permissions and can be used by this view.
Use the existing superset and viewing-compatibility helpers to validate both conditions rather than duplicating their rules in the builder.
The internal `isSchemaUpgradeAllowed` helper combines those checks for both compatibility reporting and live upgrade execution.
It checks viewing compatibility with the candidate, not with the document's schema before the upgrade.
Do not union allowed types and then rely on the superset check alone: that would accept targets containing types the requesting view cannot handle.

For stored `priority: number | string` and view `priority: number | staged(string)`, the restrictive policy must now produce a preserving no-op candidate.
With no other differences, all three flags are true.
If the view also omits a stored optional field and adds another optional field, `canUpgrade` is true but `canView` remains false until the new field is added.
Removing the staged string declaration entirely still fails if the resulting view cannot handle stored string priorities.

These are schema-based guarantees, independent of which values happen to be present in the document.
For multiple participating views, apply the same composition and compatibility requirements to each view.
Do not claim compatibility for arbitrary clients that cannot tolerate the accumulated permissions.

### 3.2 Runtime behavior

In [SchematizingSimpleTreeView.upgradeSchema][runtime-upgrade]:

1. Capture the current stored schema.
2. Obtain the composed target from the captured stored schema, the view schema, and the configured staged policy.
3. Validate both the stored-schema superset condition and the requesting view's compatibility with the target, matching `canUpgrade`.
4. After those checks, keep the existing no-op return when the reverse superset check also succeeds.
5. Otherwise, write the target through the existing schema-edit path.

Keep the enforcement in [TreeCheckout.updateSchema][checkout].
Do not use its non-superset override for this feature.

Keep the existing no-op return ahead of `runSchemaEdit`.
This satisfies the work plan's no-op event and identity requirements without adding a separate update path.

## 4. Informational diagnostics

### 4.1 Alpha API shape

Introduce `SchemaCompatibilityStatusAlpha` as an alpha extension of the existing beta [SchemaCompatibilityStatusBeta][status-api] interface:

```typescript
/**
 * Schema compatibility status with additional upgrade diagnostics.
 *
 * @sealed @alpha
 */
export interface SchemaCompatibilityStatusAlpha extends SchemaCompatibilityStatusBeta {
    readonly retainedUnknownOptionalFields?: readonly {
        readonly nodeType: string;
        readonly fieldKey: string;
    }[];
}
```

Declare `TreeViewAlpha.compatibility` with this extended type.
Leave the public and beta compatibility interfaces unchanged.
Applications access the new information through an alpha-capable view, such as `asAlpha(view).compatibility`.
Keeping the report alpha allows its design to change independently of the beta discrepancy contract.

Export the new status type through the [API barrel][api-index], [simple-tree barrel][simple-tree-index], and [package index][tree-index].
Generate the entrypoint sources so the type is available at the alpha tier, but not the beta or public tiers.
No separate exported location type is required for this shape.

Contract:

- `nodeType` is the containing object type's stored identifier.
- `fieldKey` is the stored field key, not an application property name.
- Report each retained schema field once, regardless of how many nodes use it.
- Return entries in a stable order by node type and field key.
- Omit the property when there are no entries; do not return an empty array.
- Report fields retained in the proposed target even if another difference prevents the overall upgrade.
- Do not report declared fields, rejected required-field omissions, or fields on objects without the option.
- Do not list every field inside a wholly unknown retained node type. Report the eligible omitted fields on view-known objects.

These entries explain preservation, not a change to the stored document.
They remain present after an upgrade while the view continues to omit those fields.
They disappear when the view declares the fields again.
This report remains limited to omitted optional object fields.
Do not add retained allowed types or staged optionality to its entries; those are not unknown-field locations.

The report contains schema identifiers and keys, not document field values.
Do not add these entries to telemetry without a separate need and the existing schema-artifact handling.

### 4.2 Relationship to blocking discrepancies

Reworking `discrepancies` is outside this project.
Keep its existing beta contract:

- It is `undefined` when `canView` is true.
- Otherwise, it identifies the differences that prevent viewing the current document.
- It is not a complete explanation of `canUpgrade`.

For example, a stored `Task` has optional `foo`, and the current view omits it:

- With no other changes, `discrepancies` is `undefined`; `retainedUnknownOptionalFields` identifies `Task.foo`.
- If the view also adds `bar`, the blocking discrepancy identifies missing `bar`; the retained-field list still identifies `foo`.
- If another declared field has incompatible types, report that existing blocking discrepancy alongside the retained-field information.

Do not change `SchemaDiscrepancy` into a union of errors and informational entries.
The two properties let applications distinguish "cannot open yet" from "data remains stored but is not exposed by this view."

### 4.3 Live updates

[computeCompatibility][live-status] already forwards compatibility results to the live view.
Use that path rather than adding a second diagnostic cache.
Update the internal compatibility result, cached status, and getter types to carry `SchemaCompatibilityStatusAlpha`.
The same runtime object can serve all view tiers; the public and beta types must not expose the new property.

Verify that remote schema changes refresh the report through the existing `schemaChanged` flow.
A preserved field must not cause a new error or force view invalidation merely because it appears in the informational report.

### 4.4 Relationship to existing unknown-field inspection

Main now provides [TreeContextAlpha.unknownFieldSchemas][unknown-field-schemas].
It maps view object schemas to the stored definitions of their unknown optional fields.
The view computes it lazily and invalidates its cache when the stored schema changes.

The proposed `retainedUnknownOptionalFields` report instead identifies locations retained in the candidate upgrade target.
Keep the approved report alpha and do not replace either surface as part of this merge.
Document the distinction so applications do not mistake current-schema inspection for upgrade permission.

The existing [inspection helper][unknown-field-inspection] skips fields with no allowed types.
Do not use that filtered report as the sole input for preservation: a stored field definition can still need to be retained even if it cannot contain a value.
The upgrade-target builder must remain a schema-only operation rather than requiring a live view or context.
If selection logic is shared during implementation, keep these different contracts explicit.

## 5. Snapshot and offline checks

### 5.1 Remove the invalid symmetry assumption

The [snapshot helper][snapshot-comparison] previously asserted that equivalence was symmetric.
The live integration slice removes that assertion and adds a regression for the two directions:

- A reduced view on a historical document retains the old field; its upgrade target is equivalent to that document.
- The original view on a freshly initialized reduced document must add the field; its upgrade target is not equivalent to that document.

Keep `identicalCompatibility` as the separate comparison of view-schema snapshots.
Do not redefine it as the conjunction of the directional flags.
Do not regenerate historical snapshots to erase a real schema difference.

### 5.2 Accept direct viewing or a safe upgrade in both directions

The snapshot tool applies the same compatibility rule in both directions: the viewing schema must be able to view or safely upgrade documents created with the other schema.
Direct viewing is sufficient even if the viewing client's staged policy prevents an upgrade.

For every historical snapshot, the checker accepts `currentViewOfSnapshotDocument.canView || currentViewOfSnapshotDocument.canUpgrade`.
For historical versions within `minVersionForCollaboration`, it also requires `snapshotViewOfCurrentDocument.canView || snapshotViewOfCurrentDocument.canUpgrade`.
The version-window rules remain unchanged: historical versions outside that window need not support current documents, but the current version must still support their documents.
Each required direction is rejected only when the viewing client can neither view nor upgrade.

The snapshot validation errors and `minVersionForCollaboration` documentation describe collaboration after a permitted upgrade.
Passing a snapshot check does not apply the upgrade or change the directional compatibility flags.
When `canView` is false and `canUpgrade` is true, the application must still call `upgradeSchema()` before accessing the document through that view.
Keep the runtime superset checks unchanged.
The work plan describes this [new-document upgrade requirement][collaboration-policy].

The rollback regression in [snapshotCompatibilityChecker.spec.ts][snapshot-tests] now succeeds in both update and assert modes.
Its directional assertions are unchanged: the historical view cannot immediately view the fresh document, can upgrade it, and does not have an equivalent no-op target.
The completed snapshot-policy slice includes regressions for directly viewable schemas whose upgrades are forbidden, and schemas that cannot view or upgrade, in both directions.
A current client that can neither view nor upgrade historical documents is rejected regardless of the collaboration window.
A historical client that can neither view nor upgrade current documents is rejected only within that window.

Composition changes some of those flag results without changing this snapshot policy.
In particular, an older client that stages string priorities can request a no-op upgrade of a newer document that fully permits them.
This scenario is not evidence of a viewable but non-upgradeable schema after preservation becomes unconditional.
Retain the `canView || canUpgrade` policy in both directions and continue rejecting incompatible views.

### 5.3 Preserve offline results and unrelated staging behavior

The existing [offline helpers][persisted-schema] should inherit the new decisions from the shared checker.
Keep their existing return types; exposing the new alpha diagnostics through those helpers is outside this change.

There are already skipped tests for staged-policy handling in the snapshot helpers.
Do not expand this work into a general repair of those unrelated cases.
Fix only assumptions directly affected by retaining fields from the existing stored schema.

## 6. Unaffected code paths

These behaviors must remain unchanged, apart from removing obsolete references to the alpha flag:

- Initial stored-schema generation and initialization.
- Persisted-schema extraction from an application schema.
- [Schema identity hashing][hashing], which identifies the view configuration independently of a document.
- Low-level stored-schema formats, codecs, and field-kind upgrade policies.
- Unknown-field access, export, and clone semantics.
- Schema-change concurrency, conflict resolution, and retry behavior.

Renaming, replacing, or deprecating `isEquivalent` is outside this work.
Only clarify its documentation and update its calculation to use the shared upgrade target.

The feature boundaries and prerequisite safety rules remain in the [work plan][work-plan].
Keep the existing optional-field user-story matrix.
Add only the approved composition scenarios from the work plan and the focused cases below.

## 7. Test work

### 7.1 Existing scenario tests

The work plan owns the [scenario coverage and read/write verification requirements][testing-requirements].
Run the existing [user-story fixture][scenario-tests] as the acceptance suite.
The sections below specify additional checks tied to the implementation, not a second user-story matrix.

For staged-permission preservation tests, use `Before` for the earlier schema that stages a change and `After` for the later schema that fully enables it.
Construct the stored schema or document with `After`, then open it or build its candidate with the older `Before` view.
Describe the client roles explicitly; do not frame preservation as a new application version making previously enabled types staged.
Combined scenarios may have the later version retire an optional field or add a new one; the older client then restores its own field while retaining fields and permissions from the newer document.
Tests for genuinely new staged additions and intentional incompatible narrowing remain separate.

### 7.2 Target construction

Keep the `getSchemaUpgradeCandidate` tests in [treeSchema.spec.ts][root-schema-tests], alongside the tests for its implementation module.
Keep this suite focused on returned candidate schemas, retained-field locations, and input/cache isolation.
Use application schema declarations as fixtures, but do not validate upgrade permission or viewing compatibility in this suite.
Cover:

- Preserving eligible stored fields, their allowed types, and metadata.
- Retaining field definitions based on the stored schema without inspecting document content.
- Preserving the definitions referenced through those fields, including recursive references.
- Using a view-known definition even when it was filtered out of the initial target by staging.
- Constructing candidates even when the view omits stored allowed types, without treating candidate construction as approval to upgrade.
- Keeping the view-derived representation when stored node kinds differ rather than asserting that their kinds match.
- Respecting stored-key aliases without creating duplicate fields.
- Not retaining omitted required fields, and keeping a strictly required view root required.
- Not mutating inputs or cached conversions.
- Isolating results for two documents with different histories under the same view.
- Leaving cached view-only conversions unchanged when retaining document fields and permissions.
- Composing allowed types at root, object, array, and map locations without removing stored types.
- Preserving already-enabled staged types and optionality while leaving disabled additions disabled.
- Not adding permissions to other fields that share a token when preserving a permission at its existing location.
- Retaining referenced definitions without enabling those types at unrelated locations.

Run the existing root-derived-schema tests in the same file and the view-only conversion tests in [toStoredSchema.spec.ts][conversion-tests] as well.
They protect the shared graph and conversion caches that the target builder must not mutate.

Assert exact candidate schemas and retained-field reports.
Use independent expected schemas or data snapshots for mutation checks so shared references cannot hide changes.
The compatibility and live-upgrade suites own superset checks, viewing blockers, compatibility flags, and upgrade execution.

### 7.3 Compatibility and diagnostics

Update [schemaCompatibilityTester.spec.ts][compatibility-tests]:

- Change the existing "viewable but not upgradeable" expectation for eligible unknown optional fields.
- Update the test helper that currently validates upgrade safety using a view-only conversion.
- Check the composed target derived from both schemas and the configured staged policy.
- Require both superset safety and view compatibility when `canUpgrade` is true.
- Keep policy and no-op permission scenarios here, including staged types at root, array, and map locations and retention alongside staged field changes.
- Reject strict views that cannot tolerate a stored type or optional field even when a union-based candidate passes the superset check.
- Test the new diagnostic property when compatible, upgradeable but not viewable, and incompatible for another reason.
- Verify omission when no fields are retained, stable ordering, and one entry per schema field.
- Verify stored keys in diagnostics when application property names differ.
- Keep `getViewBlockers` and blocking-discrepancy expectations unchanged for permitted omissions.
- Add type checks that alpha views expose `retainedUnknownOptionalFields`, while public and beta views do not.

Keep [discrepancy tests][discrepancy-tests] focused on viewing blockers.
Add a regression there only if an implementation change directly affects that logic.

### 7.4 Live views and snapshots

Update [schematizingTreeView.spec.ts][view-tests]:

- Correct the two existing unknown-field compatibility expectations.
- Verify the actual target retains fields and node definitions after a non-no-op upgrade.
- Verify no-op behavior and the new property through alpha view access.
- Verify that live compatibility information changes after a synchronized schema update.

Update [snapshotCompatibilityChecker.spec.ts][snapshot-tests] and [storedSchema.spec.ts][stored-tests]:

- Verify historical documents can be upgraded after eligible field removal.
- Verify directional equivalence does not trigger an assertion.
- Accept fresh-document collaboration when a supported older view can safely upgrade the document, as specified in section 5.2.
- Preserve rejection when the older view can neither view nor upgrade, and preserve acceptance when it can already view but cannot upgrade.
- Verify offline flag results agree with live-view results.

Update the existing [staged-upgrade tests][staged-tests] for the intentional policy change:

- Replace expectations that default upgrades reject already-enabled types or optionality with preserving upgrades and no-op checks where appropriate.
- Remove all `includeAlreadyEnabledUpgrades` setup and test dependencies on its old opt-in behavior.
- Verify restrictive initialization still omits staged types and retains required kinds for disabled staged-optional fields.
- Use realistic application versions to test `primaryPriority` and `fallbackPriority` sharing a staged token, and a corresponding staged-optional case.
- Verify a token remains `partial` after preservation-only upgrades and becomes enabled only when the policy requests its remaining permissions.
- Combine retained optional fields with preserved staged permissions and a new field so compatibility calculation and live application must agree on a non-no-op target.
- Exercise repeated upgrades from multiple compatible clients, verify accumulated permissions and readable content, and preserve the existing no-op event and identity checks.
- Verify a restrictive observer refreshes partial token statuses after a remote upgrade, can write the newly enabled values, and has a no-op upgrade afterward.
- Exercise actual array and map upgrades that retain a stored type while explicitly enabling a different staged type; verify both clients' stored schema and synchronized content.

The SharedTree summary/load suite also covers an omitted node-valued field and already-enabled staged permissions surviving a composed upgrade, summary, and load into new clients.
It verifies that another upgrade after loading retains the historical schema and content again.
Include `lib/test/mochaHooks.js` when selecting test files explicitly so the package's service cleanup runs between tests.
The added integration coverage passes in a combined run of the compatibility, staged-upgrade, SharedTree, and user-story suites: 219 tests passed and three existing tests were skipped.
The test TypeScript build, focused Biome and ESLint checks, and whitespace checks also pass.

Add negative compile-time coverage showing that a policy literal with the removed alpha flag is rejected.
Regenerate API reports rather than editing them, and verify the corresponding aggregator surface.

## 8. Implementation order and validation

### Task list

Check a task only after its changes and relevant validation are complete.
Completion does not imply that the changes have been committed.
Update this list after each implementation slice.

- [x] **Build the schema-only upgrade target.**
  - [x] Document the helper's inputs, candidate output, retention report, and mutation restrictions.
  - [x] Add focused tests and verify the failing baseline before implementation.
  - [x] Implement `getSchemaUpgradeCandidate` and its package-internal exports without wiring live callers.
  - [x] Verify exact targets, retained definitions, rejected constraints, staging, metadata, stored keys, cache isolation, and callback safety.
  - [x] Run the relevant regression suites, TypeScript builds, formatting, and lint.
- [x] **Connect compatibility calculation and upgrade execution.**
  - [x] Use the shared target to calculate `canUpgrade` and `isEquivalent`, keeping viewing-blocker checks unchanged.
  - [x] Use the same target in `upgradeSchema`, preserving existing safety checks and the no-op path.
  - [x] Update affected test helpers and expectations; verify live upgrades and the existing user-story scenarios.
- [x] **Compose allowed types and staged optionality at each location.**
  - [x] Document and test candidate composition for root, object, map, and array fields.
  - [x] Preserve stored allowed types and supported optionality independently of the policy's decisions about new permissions.
  - [x] Preserve referenced node definitions without concealing view-known conflicts or enabling unrelated locations.
  - [x] Keep shared-token upgrades partial unless explicitly enabled, including staged optionality.
  - [x] Remove `includeAlreadyEnabledUpgrades`, token-wide preservation helpers, and obsolete internal exports.
  - [x] Use the same composed candidate and both validation conditions for `canUpgrade` and live upgrades.
  - [x] Update affected snapshot and offline expectations without changing version windows or symmetric acceptance.
  - [x] Verify realistic combined changes, no-op behavior, initialization isolation, cache safety, and multi-client composition.
  - [x] Update policy documentation, alpha type tests, generated API reports, and the changeset for both packages.
- [ ] **Expose alpha upgrade diagnostics. Next slice.**
  - [ ] Add `SchemaCompatibilityStatusAlpha` and `retainedUnknownOptionalFields` to the alpha view surface.
  - [ ] Forward the report through compatibility updates and add the required exports.
  - [ ] Test diagnostic contents, omission, ordering, coexistence with blockers, and remote updates.
  - [ ] Verify alpha access and public/beta exclusion with type checks.
- [x] **Update snapshot and offline compatibility.**
  - [x] Remove the equivalence-symmetry assumption while preserving `identicalCompatibility`.
  - [x] Verify agreement with live compatibility results and cover the current fresh-document upgrade requirement.
  - [x] Update directly affected expectations without repairing unrelated skipped cases.
- [x] **Accept direct viewing or a safe upgrade in both compatibility directions.**
  - [x] Accept `canView || canUpgrade` for current clients viewing every historical snapshot and for historical clients within the collaboration window viewing current documents.
  - [x] Keep the version-window rules and runtime superset checks unchanged.
  - [x] Change the rollback snapshot test to expect success, while preserving its directional compatibility assertions.
  - [x] Verify directly viewable but non-upgradeable schemas and rejection when neither flag is true in both directions.
  - [x] Update snapshot validation errors, collaboration-policy documentation, and the changeset.
- [ ] **Complete documentation and API delivery.**
  - [x] Clarify the compatibility flags' API documentation and add the behavior changeset for `@fluidframework/tree` and `fluid-framework`.
  - [x] Extend the API documentation and changeset for composed permissions and the alpha flag removal, including migration from token-wide preservation.
  - [ ] Confirm the changeset draft and check downstream alpha consumers before merging the flag removal.
  - [ ] Complete the remaining work plan [documentation and delivery checklist][delivery] items, including alpha entrypoints and API reports.
- [ ] **Validate the integrated implementation.**
  - [ ] Run all directly affected suites together, including the user-story, snapshot, diagnostic, and staged-upgrade tests.
  - [x] Verify that all seven previously failing preservation scenarios pass without weakening their assertions.
  - [ ] Pass the affected TypeScript, formatting, lint, and API checks.

Live integration validation, before the snapshot-policy follow-up: 1,233 tests passed across the integration and regression suites listed below, with seven pre-existing skipped snapshot tests unchanged.
This included all 16 builder tests and all 36 user-story tests; the seven previously failing preservation scenarios pass.
The no-op user-story helper also checks `isEquivalent`, in addition to its existing event, operation, and root-identity checks.
New tests cover retaining removed fields alongside already-enabled staged changes, retaining a node definition without enabling its staged use elsewhere, and directional snapshot and persisted-schema compatibility.
Snapshot-policy follow-up validation: 228 tests pass across the snapshot, compatibility, persisted-schema, staged-upgrade, and user-story suites, with the same seven skipped tests unchanged.
The rollback snapshot test now succeeds without changing its directional flags.
Those tests describe the pre-composition behavior: they accept directly viewable clients whose restrictive staged candidates are rejected.
They reject incompatible historical clients only within the configured collaboration window, but require the current client to view or upgrade historical documents regardless of that window.
`pnpm run build:esm`, `pnpm run build:test:esm`, and the focused Biome, ESLint, and whitespace checks pass.
Composition-slice validation: 1,244 tests pass across the integration suites below, with the same seven skipped snapshot tests unchanged.
The tests cover all stored field locations, root optionality, recursive retained types, shared-token partial states, explicit enablement, composed conflicts, and repeated multi-client no-op upgrades.
The negative type test rejects policy literals using the removed alpha flag.
The tree and `fluid-framework` ESM builds and type-test builds pass, and generated API reports contain only the alpha member removal.
Tree public, beta, and alpha ESM export checks and the aggregator alpha ESM export check pass.
The aggregator's stale generated entrypoints were regenerated before its API reports.
The entrypoint tool reports an existing untagged `InternalTypes` export, and API Extractor warns that the project TypeScript version is newer than its bundled version; report generation and export checks complete successfully.
Alpha diagnostic tests and final feature documentation remain outstanding.
API review requires confirmation of the changeset and downstream alpha-consumer impact before merging; no API Council approval is required for this alpha-only signature removal.

### Validation commands

From `packages/dds/tree`, regenerate entrypoint sources when top-level exports or their release tiers change, such as when adding the alpha diagnostic type.
Removing a member from an existing interface does not require regenerating tree entrypoints.
When regeneration is needed, rebuild immediately afterward, before compiling the tests:

```bash
pnpm run generate:entrypoint-sources
pnpm run build:esm
pnpm run build:test:esm
```

The live integration slice was validated with these suites together:

```bash
MOCHA_SPEC='lib/test/feature-libraries/modular-schema/schemaEvolutionExamples.spec.js' \
pnpm run test:mocha:esm --reporter dot \
  lib/test/simple-tree/api/schemaCompatibilityTester.spec.js \
  lib/test/shared-tree/schematizingTreeView.spec.js \
  lib/test/simple-tree/api/stagedSchemaUpgrade.spec.js \
  lib/test/simple-tree/api/snapshotCompatibilityChecker.spec.js \
  lib/test/simple-tree/treeSchema.spec.js \
  lib/test/simple-tree/toStoredSchema.spec.js \
  lib/test/shared-tree/treeCheckout.spec.js \
  lib/test/simple-tree/api/storedSchema.spec.js \
  lib/test/shared-tree/independentView.spec.js \
  lib/test/simple-tree/api/schemaHash.spec.js \
  lib/test/feature-libraries/modular-schema/comparison.spec.js
```

For permission composition, run the affected suites above, including the builder, staged-upgrade, compatibility, live-upgrade, snapshot, persisted-schema, and schema-hashing tests.
Include the affected diagnostic and schema-option suites when adding the alpha diagnostic API.

The snapshot-policy follow-up was validated with:

```bash
MOCHA_SPEC='lib/test/simple-tree/api/snapshotCompatibilityChecker.spec.js' \
pnpm run test:mocha:esm --reporter dot \
  lib/test/simple-tree/api/schemaCompatibilityTester.spec.js \
  lib/test/simple-tree/api/storedSchema.spec.js \
  lib/test/simple-tree/api/stagedSchemaUpgrade.spec.js \
  lib/test/feature-libraries/modular-schema/schemaEvolutionExamples.spec.js
```

Use the package's existing Biome and ESLint commands on changed source files.
Run broader tests only when the focused results or changed code paths require them.

Regenerate tree API reports after compiling:

```bash
pnpm run build:api-reports
```

Then compile and regenerate reports for `packages/framework/fluid-framework`.
Follow the [tree API report guidance][api-report-guidance] if unrelated report changes appear.

Implementation validation is complete when the composed-target, per-location staging, and diagnostic tests pass, the acceptance suite passes, and the affected type, lint, and API checks pass.
Use the [work plan][work-plan] for feature acceptance and delivery requirements rather than maintaining a second checklist here.

[baseline]: https://github.com/Josmithr/FluidFramework/commit/95965373ea4b80c823892482f4cabe7402ab9e71
[main-baseline]: https://github.com/microsoft/FluidFramework/commit/75902eb593f79625ac003c03dcb7e9d2f8f69497
[work-plan]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md
[requirements]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#required-behavior
[compatibility-expectations]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#5-compatibility-status-and-events
[collaboration-policy]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#63-keep-the-new-document-upgrade-requirement-visible
[testing-requirements]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#7-required-tests
[delivery]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#8-documentation-and-delivery
[overview]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-overview.md
[conversion]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/simple-tree/treeSchema.ts#L393
[conversion-transforms]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/simple-tree/toStoredSchema.ts
[factory-options]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/simple-tree/api/schemaFactoryOptions.ts
[unknown-field-schemas]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/simple-tree/api/tree.ts#L464
[unknown-field-inspection]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/shared-tree/schematizingTreeView.ts#L104
[root-schema-tests]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/test/simple-tree/treeSchema.spec.ts
[simple-tree-index]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/index.ts
[api-index]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/index.ts
[tree-index]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/index.ts
[tree-schema]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/simple-tree/treeSchema.ts
[compatibility]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/schemaCompatibilityTester.ts
[runtime-upgrade]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/shared-tree/schematizingTreeView.ts#L399
[live-status]: https://github.com/microsoft/FluidFramework/blob/75902eb593f79625ac003c03dcb7e9d2f8f69497/packages/dds/tree/src/shared-tree/schematizingTreeView.ts#L618
[discrepancies]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/discrepancies.ts#L509
[comparison]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/feature-libraries/modular-schema/comparison.ts#L196
[checkout]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/shared-tree/treeCheckout.ts#L2013
[staged-policy]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/core/toStored.ts
[status-api]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/tree.ts#L982
[snapshot-comparison]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/snapshotCompatibilityChecker.ts#L905
[persisted-schema]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/storedSchema.ts
[hashing]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/simple-tree/api/schemaHash.ts#L38
[scenario-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/feature-libraries/modular-schema/schemaEvolutionExamples.spec.ts
[conversion-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/simple-tree/toStoredSchema.spec.ts
[compatibility-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/simple-tree/api/schemaCompatibilityTester.spec.ts
[discrepancy-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/simple-tree/api/discrepancies.spec.ts
[view-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/shared-tree/schematizingTreeView.spec.ts
[snapshot-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/simple-tree/api/snapshotCompatibilityChecker.spec.ts
[stored-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/simple-tree/api/storedSchema.spec.ts
[staged-tests]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/packages/dds/tree/src/test/simple-tree/api/stagedSchemaUpgrade.spec.ts
[api-report-guidance]: https://github.com/Josmithr/FluidFramework/blob/95965373ea4b80c823892482f4cabe7402ab9e71/.claude/skills/ci-readiness-check/tree-api-checks.md
