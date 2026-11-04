# Implementation plan: Preserve unknown optional fields during schema upgrades

## Status and scope

Implementation is proceeding in reviewed slices.
The first slice is complete: the internal `getSchemaUpgradeCandidate` target builder and focused unit tests are implemented.
The builder has no live upgrade or compatibility-checker callers yet.
The remaining integration steps and the alpha diagnostic API described below are still planned.
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

## 1. Findings from the code

| Area | Current behavior | Required change |
| --- | --- | --- |
| [Stored-schema conversion][conversion] | `toUpgradeSchema` derives its result from the view schema and staged policy only. It does not consider the existing stored schema. | Add a shared builder that derives the target from both schemas and the effective staged-upgrade policy. |
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
The proposed target currently omits fields that the application no longer declares.
The superset check correctly rejects that target.

## 2. Shared upgrade-target construction

### 2.1 Internal interface

Add one internal helper, `getSchemaUpgradeCandidate`, alongside the root conversion functions in [treeSchema.ts][conversion].
The functions `toStoredSchema`, `toInitialSchema`, and `toUpgradeSchema` moved there on main.
Reuse the lower-level transformations that remain in [toStoredSchema.ts][conversion-transforms].
Expose it through the package-internal [simple-tree barrel][simple-tree-index] for the live upgrade path.
Do not add it to the customer-facing entry points.

Inputs:

- The complete `TreeSchema` for the view.
- The existing `TreeStoredSchema`.
- The effective `StagedSchemaUpgradePolicy`.

Use the complete `TreeSchema`, which includes the root field and all reachable view definitions.
A single node schema does not describe root optionality or root-level unions.

These inputs are sufficient to determine the target.
The helper is a pure schema operation: it does not inspect document content or require a tree instance, checkout, or runtime.
Retaining a field must not depend on whether any node currently contains a value for it.

Outputs:

- The proposed `TreeStoredSchema`.
- A list of retained optional field locations.

The proposed schema is a complete candidate stored schema, not a patch or an executable upgrade object.
The helper does not apply the upgrade or guarantee that the candidate passes the upgrade checks.
Its callers validate the candidate before applying it.

Both compatibility calculation and upgrade execution must use this helper.
Return the diagnostic locations from the same construction pass so the report describes what the target actually retains.

Keep the existing view-only conversion available.
Initialization and extraction derive their result from the view schema and policy without using an existing stored schema.
They must not receive retained historical fields.

### 2.2 Construction rules

Convert the view schema to its stored representation before combining or comparing schema structures.
Keep the original view schema available to determine which objects permit unknown optional fields and to resolve view-known types excluded by staging.

Perform field retention and the final stored-schema upgrade checks on stored-schema representations.
The original view supplies the policy and declaration information that conversion does not preserve.
Section 2.4 describes how this applies to staged declarations.

1. Generate the normal stored-schema target from the view and effective staged policy.
2. Copy its node-definition map before retaining definitions from the existing stored schema.
3. Process its definitions with a work queue and a visited set.
4. For a view object that enables `allowUnknownOptionalFields`, inspect the matching stored object definition.
5. Retain stored fields whose stored keys are absent from the view object and whose stored kind is optional.
6. Preserve each retained field's allowed types and persisted metadata.
7. Process all node-type references required by the resulting definitions.
8. Return the completed target and retained-field locations.

Use the resolved `allowUnknownOptionalFields` value from the view object, not the presence of an explicitly supplied option.
The factory now defaults this value to `true`, and applications can override it at factory or object scope.

Check the view node kind, not only the stored node class.
Arrays also use `ObjectNodeStoredSchema`, but they do not opt into unknown object fields.

Match fields by stored key.
A different application property name with the same stored key identifies the same field.
It must not produce an extra retained-field entry.

Do not modify a field that the view still declares to hide a conflict.
Changes to that field must continue to satisfy the existing allowed-type and field-kind rules.

### 2.3 Referenced node definitions

When a required type is not already in the generated target:

- If the complete view schema knows the identifier, derive the definition from that view declaration and the effective policy.
- Otherwise, retain its existing stored definition.
- Continue through its field references, including references in arrays and maps.
- Process each identifier once so recursive definitions terminate.

A missing stored definition represents a type that permits no nodes in the current low-level model.
Preserve such a reference without inventing a stored definition or treating it as proof of corruption.
If the view supplies a definition for that identifier, normal conversion and upgrade checks still apply.

Do not copy every old definition or union every allowed-type set without checking its role.
That could conceal an incompatible declared field or change staged-upgrade behavior.

The final repository-wide superset check remains mandatory.
It includes node definitions that can be used by detached content, even if they are not reachable from the document root.
Do not add a root-reachability pruning rule.
If a definition outside the retained reference set would be lost, keep the existing upgrade rejection rather than silently deleting it.

### 2.4 Staged declarations

The complete [TreeSchema definitions][tree-schema] and the generated stored definitions are not interchangeable.
The generated target excludes types reachable only through disabled staged declarations.

A retained field can refer to one of those excluded types.
If the view knows that type, use its current declaration.
Do not copy the historical definition solely because the type was absent from the initial generated target.
Otherwise, an incompatible staged declaration could be hidden from the upgrade check.

Preserving a definition must not enable a staged allowed type at another location.
Keep the policy's existing rules for staged types, staged optional fields, and `includeAlreadyEnabledUpgrades`.
Both callers already resolve the effective policy; preserve agreement between them.

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

Initially, build the result from both schemas and the effective policy on demand.
Do not cache it only by mutable repository identity.
The same repository can change, and one view configuration can be used with different stored schemas.

## 3. Compatibility and upgrade execution

### 3.1 Compatibility flags

Keep `canView` based on discrepancies against the current stored schema.
Continue to collect staged-upgrade status even when viewing is blocked.

Use the shared target for:

- `canUpgrade`: the existing stored schema can be upgraded to that target under the superset rules.
- `isEquivalent`: the view can already access the document, and the proposed upgrade target is equivalent to the document's current stored schema under the schema upgrade rules.

Keep the `isEquivalent` name and update its public documentation to make these semantics explicit:

- The comparison is between the document's current stored schema and the proposed stored-schema target, including retained fields and the effective staged-upgrade policy.
- Both must permit an upgrade to the other under the existing rules. The reverse check establishes equivalence; it does not perform a downgrade.
- A `true` result also requires `canView` to be true. It implies `canUpgrade` is true and `upgradeSchema()` will make no stored-schema change.
- It does not require identical serialized schemas. Metadata differences ignored by the upgrade checks do not affect the result.
- It does not mean that initialization with this view would produce the same schema, or that different application versions can view each other's documents.
- A `false` result alone does not mean that viewing or upgrading is forbidden. Applications must use `canView` and `canUpgrade` for those decisions.

These calculations implement the work plan's [compatibility expectations][compatibility-expectations].
After a successful upgrade, the resulting stored schema must support viewing.
Test that postcondition as well as the superset condition.

### 3.2 Runtime behavior

In [SchematizingSimpleTreeView.upgradeSchema][runtime-upgrade]:

1. Capture the current stored schema.
2. Obtain the target from the captured stored schema, the view schema, and the effective staged policy.
3. Run the existing superset check.
4. Keep the existing no-op return when the reverse check also succeeds.
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

The [snapshot helper][snapshot-comparison] currently asserts that equivalence is symmetric.
Remove that assertion and add a regression for the two directions:

- A reduced view on a historical document retains the old field; its upgrade target is equivalent to that document.
- The original view on a freshly initialized reduced document must add the field; its upgrade target is not equivalent to that document.

Keep `identicalCompatibility` as the separate comparison of view-schema snapshots.
Do not redefine it as the conjunction of the directional flags.
Do not regenerate historical snapshots to erase a real schema difference.

### 5.2 Keep collaboration policy unchanged

Leave the snapshot tool's forward-viewability checks unchanged: continue to check `canView`, not `canUpgrade`.
The work plan explains the [fresh-document collaboration restriction][collaboration-limit] that this preserves.

The existing [offline helpers][persisted-schema] should inherit the new decisions from the shared checker.
Keep their existing return types; exposing the new alpha diagnostics through those helpers is outside this change.

There are already skipped tests for staged-policy handling in the snapshot helpers.
Do not expand this work into a general repair of those unrelated cases.
Fix only assumptions directly affected by retaining fields from the existing stored schema.

## 6. Unaffected code paths

These paths do not need implementation changes:

- Initial stored-schema generation and initialization.
- Persisted-schema extraction from an application schema.
- [Schema identity hashing][hashing], which identifies the view configuration independently of a document.
- Low-level stored-schema formats, codecs, and field-kind upgrade policies.
- Unknown-field access, export, and clone semantics.
- Schema-change concurrency, conflict resolution, and retry behavior.

Renaming, replacing, or deprecating `isEquivalent` is outside this work.
Only clarify its documentation and update its calculation to use the shared upgrade target.

The feature boundaries and prerequisite safety rules remain in the [work plan][work-plan].
Do not expand the user-story matrix as part of this implementation.

## 7. Test work

### 7.1 Existing scenario tests

The work plan owns the [scenario coverage and read/write verification requirements][testing-requirements].
Run the existing [user-story fixture][scenario-tests] as the acceptance suite.
The sections below specify additional checks tied to the implementation, not a second user-story matrix.

### 7.2 Target construction

Keep the `getSchemaUpgradeCandidate` tests in [treeSchema.spec.ts][root-schema-tests], alongside the tests for its implementation module.
Cover:

- Preserving eligible stored fields, their allowed types, and metadata.
- Retaining field definitions based on the stored schema without inspecting document content.
- Preserving the definitions referenced through those fields, including recursive references.
- Using a view-known definition even when it was filtered out of the initial target by staging.
- Rejecting an incompatible view-known definition through the normal upgrade checks.
- Respecting stored-key aliases without creating duplicate fields.
- Not copying required fields or overriding known conflicting fields.
- Not mutating inputs or cached conversions.
- Isolating results for two documents with different histories under the same view.
- Keeping initialization independent of retained document fields.

Run the existing root-derived-schema tests in the same file and the view-only conversion tests in [toStoredSchema.spec.ts][conversion-tests] as well.
They protect the shared graph and conversion caches that the target builder must not mutate.

Assert exact target schemas, not only success flags.
For accepted targets, verify both the superset condition and view compatibility.

### 7.3 Compatibility and diagnostics

Update [schemaCompatibilityTester.spec.ts][compatibility-tests]:

- Change the existing "viewable but not upgradeable" expectation for eligible unknown optional fields.
- Update the test helper that currently validates upgrade safety using a view-only conversion.
- Check the actual target derived from both schemas and the effective staged policy.
- Test the new diagnostic property when compatible, upgradeable but not viewable, and incompatible for another reason.
- Verify omission when no fields are retained, stable ordering, and one entry per schema field.
- Verify stored keys in diagnostics when application property names differ.
- Keep `getSchemaIncompatibilityDetails` and blocking-discrepancy expectations unchanged for permitted omissions.
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
- Keep the fresh-document collaboration failure visible when older versions are still required to collaborate.
- Verify offline flag results agree with live-view results.

Run the existing [staged-upgrade tests][staged-tests] to preserve their policy behavior.
Add only focused coverage for interactions introduced by the target builder.

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
- [ ] **Connect compatibility calculation and upgrade execution. Next slice.**
  - [ ] Use the shared target to calculate `canUpgrade` and `isEquivalent`, keeping viewing-blocker checks unchanged.
  - [ ] Use the same target in `upgradeSchema`, preserving existing safety checks and the no-op path.
  - [ ] Update affected test helpers and expectations; verify live upgrades and the existing user-story scenarios.
- [ ] **Expose alpha upgrade diagnostics.**
  - [ ] Add `SchemaCompatibilityStatusAlpha` and `retainedUnknownOptionalFields` to the alpha view surface.
  - [ ] Forward the report through compatibility updates and add the required exports.
  - [ ] Test diagnostic contents, omission, ordering, coexistence with blockers, and remote updates.
  - [ ] Verify alpha access and public/beta exclusion with type checks.
- [ ] **Update snapshot and offline compatibility.**
  - [ ] Remove the equivalence-symmetry assumption while preserving `identicalCompatibility`.
  - [ ] Verify agreement with live compatibility results and retain the fresh-document collaboration restriction.
  - [ ] Update directly affected expectations without repairing unrelated skipped cases.
- [ ] **Complete documentation and API delivery.**
  - [ ] Complete the work plan's [documentation and delivery checklist][delivery], including generated entrypoints, API reports, and the changeset.
- [ ] **Validate the integrated implementation.**
  - [ ] Run all directly affected suites together, including the user-story, snapshot, diagnostic, and staged-upgrade tests.
  - [ ] Verify that all seven previously failing preservation scenarios pass without weakening their assertions.
  - [ ] Pass the affected TypeScript, formatting, lint, and API checks.

First-slice validation: 22 new builder tests pass within 377 passing related tests.
TypeScript, formatting, and lint checks pass.
The separate user-story fixture remains at 29 passing tests and seven expected failures because the builder is not yet wired into live upgrades.
These results describe the completed slice, not final feature validation.

### Validation commands

From `packages/dds/tree`, regenerate entrypoint sources after adding the alpha type to the package index.
Rebuild immediately afterward, before compiling the tests:

```bash
pnpm run generate:entrypoint-sources
pnpm run build:esm
pnpm run build:test:esm
```

Run the directly affected suites together:

```bash
MOCHA_SPEC='lib/test/feature-libraries/modular-schema/schemaEvolutionExamples.spec.js' \
pnpm run test:mocha:esm --reporter spec \
  lib/test/simple-tree/toStoredSchema.spec.js \
  lib/test/simple-tree/treeSchema.spec.js \
  lib/test/simple-tree/api/schemaFactoryOptions.spec.js \
  lib/test/simple-tree/api/schemaCompatibilityTester.spec.js \
  lib/test/simple-tree/api/discrepancies.spec.js \
  lib/test/simple-tree/api/stagedSchemaUpgrade.spec.js \
  lib/test/simple-tree/api/snapshotCompatibilityChecker.spec.js \
  lib/test/simple-tree/api/storedSchema.spec.js \
  lib/test/shared-tree/schematizingTreeView.spec.js
```

Use the package's existing Biome and ESLint commands on changed source files.
Run broader tests only when the focused results or changed code paths require them.

Regenerate tree API reports after compiling:

```bash
pnpm run build:api-reports
```

Then compile and regenerate reports for `packages/framework/fluid-framework`.
Follow the [tree API report guidance][api-report-guidance] if unrelated report changes appear.

Implementation validation is complete when the shared target and diagnostic tests pass, the acceptance suite passes, and the affected type, lint, and API checks pass.
Use the [work plan][work-plan] for feature acceptance and delivery requirements rather than maintaining a second checklist here.

[baseline]: https://github.com/Josmithr/FluidFramework/commit/95965373ea4b80c823892482f4cabe7402ab9e71
[main-baseline]: https://github.com/microsoft/FluidFramework/commit/75902eb593f79625ac003c03dcb7e9d2f8f69497
[work-plan]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md
[requirements]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#required-behavior
[compatibility-expectations]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#5-compatibility-status-and-events
[collaboration-limit]: https://github.com/Josmithr/FluidFramework/blob/tree/support-removing-optional-fields-from-object-schema/packages/dds/tree/docs/optional-field-removal-work-plan.md#63-keep-the-new-document-collaboration-limit-visible
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
