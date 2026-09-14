# Alpha Schema Compatibility Diagnostics Plan

Status: The first eager implementation is checked in as a draft.
Compatibility-analysis consolidation is implemented and has passed focused tests and differential checks.
Performance acceptance remains open.

## Goal

Report all schema discrepancies within the comparison scope, including staging and persisted metadata differences.
Give each schema compatibility flag a subset containing only discrepancies that contribute to that flag being false.
Keep schema differences distinct from their compatibility effects.
Expose all new APIs through alpha types.
Do not change the existing compatibility rules.

Use test-driven development (TDD).
Write a failing test before each behavior change.
Follow the repository [Coding Guidelines](../../../../../docs/content/Guidelines/Coding-Guidelines.md).

Document the code thoroughly using TSDoc syntax on API members.
Follow the repository [TSDoc Guidelines](../../../../../docs/content/Guidelines/Documentation-Guidelines/Documenting-TypeScript/TSDoc-Guidelines.md).
Use Simplified Technical English for documentation and test comments.

## Terms

- **View schema:** The schema that the application uses to read and edit tree content.
- **Stored schema:** The schema recorded in the document.
- **Upgrade target:** The stored schema that an upgrade would produce under the configured staged-upgrade policy.
- **Equivalence:** The existing `isEquivalent` contract about the document shapes allowed by the schemas, not structural equality. Preserve its current policy and results.
- **Discrepancy:** A detected difference in schema data, whether or not it affects compatibility.
- **Blocker:** A difference that causes a compatibility check to fail.
- **Diagnostic:** An entry that identifies a discrepancy and supplies the details needed to explain it.
- **Complete list:** `allDiscrepancies`, which contains each distinct discrepancy once.
- **Condition-specific subset:** A list of entries from `allDiscrepancies` that contribute to one compatibility flag being false.

## Scope

Add an always-available `allDiscrepancies` list and three condition-specific subsets:

| Operation | Decision | Comparison |
| --- | --- | --- |
| View | `canView` | Stored schema and view schema |
| Upgrade | `canUpgrade` | Stored schema and upgrade target |
| Equivalence | `isEquivalent` | Viewing comparison and stored-schema comparisons in both directions between stored schema and upgrade target |

The complete list includes content constraints, staging annotations, and `persistedMetadata`, including application-provided persisted metadata.
Exclude non-persisted `metadata`, including `metadata.custom` and `metadata.description`, for both nodes and fields.
Stored schema does not retain these values. Their absence is not a discrepancy.
Apply this exclusion consistently to all entry points, even when both inputs retain non-persisted metadata.
Do not inspect, serialize, or report unsupported-value diagnostics for excluded metadata.
Staging annotations such as `stagedSchemaUpgrade` remain in scope; they are not arbitrary custom metadata.
In the rest of this plan, metadata comparison, payloads, and benchmarks refer only to `persistedMetadata`.
It can be nonempty when all three compatibility flags are true.
Include differences accepted by every compatibility check, not only blockers.
Exclude runtime object identity, methods, and application state that is not schema metadata.

Each condition-specific subset must explain all discrepancies that contribute to its flag being false.
Use entries from the complete list without changing their payloads or adding public check labels.
A discrepancy can belong to zero, one, or multiple subsets. A subset can equal the complete list.
Keep entries granular enough that a subset does not include accepted differences bundled with a blocker.
Include locations, schema-side labels, and compared values needed to explain each discrepancy.

Preserve the existing beta `discrepancies` contract and at least its current diagnostic detail.
The beta report can gain information, but it must not lose existing diagnostics or details, including non-blocking context.
The new alpha reports have stricter invariants than the beta report.
Consider deprecating the beta `discrepancies` API in a future change, not in this work.

Completeness of `allDiscrepancies` is independent of compatibility policy.
Subset membership follows the existing compatibility rules.
Different schema representations can be equivalent under these rules, even when the complete list records their differences.

The work does not include:

- Changes to viewing or upgrade policy.
- Breaking changes to the beta `discrepancies` contract or reductions in its diagnostic detail.
- Deprecation of the beta `discrepancies` API.
- A report for `canInitialize`. This flag describes initialization state, not schema equivalence.
- Comparisons of non-persisted metadata, methods, runtime object identity, or unrelated application state.
- New rules for types that cannot contain valid content.
- Changes to persisted formats or merge behavior.

## Existing Behavior

[The discrepancy walk](../../src/simple-tree/api/discrepancies.ts) identifies viewing blockers.
It already checks the full set of shared type identifiers, not only types reachable from the root.
However, some branches omit details or stop comparison early.

For example, a field absent from the stored object produces a field-kind diagnostic.
The report omits the field's allowed-type difference.
An explicitly forbidden field can produce both diagnostics.
These equivalent representations therefore produce different levels of detail.

Before consolidation, [the compatibility checker](../../src/simple-tree/api/schemaCompatibilityTester.ts) derived `canView` from the existing report.
It derived `canUpgrade` from `allowsRepoSuperset`, which stops at the first failure.
It derived `isEquivalent` from `canView`, `canUpgrade`, and the reverse `allowsRepoSuperset` comparison from the upgrade target to the stored schema.
The boolean expression skipped later checks after a failure.
The consolidated checker evaluates all three checks through diagnostic-producing comparisons and derives the flags from their blocker subsets.

[The upgrade comparison](../../src/feature-libraries/modular-schema/comparison.ts) checks every stored node definition.
Detached trees can use definitions that the root cannot reach.
Definitions with the same identifier must remain compatible.
Do not use root reachability to suppress these checks.

[The API conversion functions](../../src/api.ts) return the same runtime object.
An alpha cast does not create a separate view.
Therefore, do not change the meaning of the beta property through an alpha type override.

## Proposed API

The following names are proposals for review:

```typescript
/**
 * Reports whether a schema can be viewed and the reasons that prevent viewing.
 *
 * @sealed
 * @alpha
 */
export type ViewableStatus = {
    readonly canView: true;
} | {
    readonly canView: false;

    /**
        * Reports the reasons that prevent viewing. Contains at least one blocker.
     */
    readonly viewDiscrepancies: readonly SchemaDiscrepancyAlpha[];
};

/**
 * Reports whether a schema can be upgraded and the reasons that prevent upgrading.
 *
 * @sealed
 * @alpha
 */
export type UpgradeableStatus = {
    readonly canUpgrade: true;
} | {
    readonly canUpgrade: false;

    /**
        * Reports the reasons that prevent upgrading. Contains at least one blocker.
     */
    readonly upgradeDiscrepancies: readonly SchemaDiscrepancyAlpha[];
};

/**
 * Reports whether two schemas are equivalent and the reasons that prevent equivalence.
 *
 * @sealed
 * @alpha
 */
export type EquivalenceStatus = {
    readonly isEquivalent: true;
} | {
    readonly isEquivalent: false;

    /**
        * Reports the reasons that prevent equivalence. Contains at least one blocker.
     */
    readonly equivalenceDiscrepancies: readonly SchemaDiscrepancyAlpha[];
};

/**
 * Reports all schema discrepancies and their effects on compatibility.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityStatusAlpha =
    SchemaCompatibilityStatusBeta &
    ViewableStatus &
    UpgradeableStatus &
    EquivalenceStatus & {
        /**
         * Reports every distinct schema discrepancy within the comparison scope,
         * including staging and persisted metadata differences.
         * The array is empty only when no discrepancies are found.
         * It can be nonempty when all compatibility flags are true.
         *
         * @remarks
         * Non-persisted metadata, including custom metadata and descriptions, is not compared.
         * Its absence from stored schema is not a discrepancy.
         */
        readonly allDiscrepancies: readonly SchemaDiscrepancyAlpha[];
    };
```

Override `TreeViewAlpha.compatibility` to return `SchemaCompatibilityStatusAlpha`.
Keep the beta `discrepancies` property on the same object with its existing contract and at least its current diagnostic detail.
No new `asAlpha` overload is needed to access the status through an alpha view.

Use an intersection type to combine the beta status, the three discriminated unions, and the complete-list property.
An interface cannot extend these union types.
The alpha status must remain assignable to `SchemaCompatibilityStatusBeta`.

Always provide `allDiscrepancies`, without requiring callers to narrow a flag.
When a flag is `true`, omit its condition-specific diagnostic property from both the type branch and the runtime object.
Do not provide an empty array or an explicit `undefined` property for that flag.
When a flag is `false`, provide its alpha diagnostic property with at least one blocker.
Keep the flags and diagnostic arrays readonly.
The array types do not enforce a minimum length, so document and test the nonempty contract.

Require callers to narrow the corresponding flag before accessing a condition-specific subset:

```typescript
const status = view.compatibility;
console.log(status.allDiscrepancies);
if (!status.canView) {
    console.log(status.viewDiscrepancies);
}
```

Apply the same access rule to `canUpgrade` and `isEquivalent`.
TypeScript's structural typing does not guarantee runtime absence of extra properties.
Test property absence separately from type narrowing.

Use a shared alpha diagnostic union, provisionally named `SchemaDiscrepancyAlpha`, for all four lists.
The earlier operation-specific element types are superseded by this shared model.
Use `view`, `stored`, and `target` to identify schema values, not the checks that discovered them.
The target is not necessarily the original view schema because staged-upgrade policy can change it.
Retain original-schema differences and any distinct effective-target differences needed to explain blockers.
Do not swap side labels or emit duplicates when a comparison runs in the reverse direction.

Define discrepancy identity by its location, differing aspect, schema sides, and values, not by a failed check.
Do not merge distinct differences solely because they share a field or node identifier.
Split allowed-type and other collections when their individual differences have different compatibility effects.
Build each subset by selecting the complete entries, not by reformatting them.
Subset membership must be verifiable by diagnostic value after JSON serialization; do not require object identity as a public contract.
Keep check-specific classification internal. Do not add public check labels or lists of failed checks to entries.
Do not add variants to the beta `SchemaDiscrepancy` union.

### Node Diagnostic Shapes

Use two distinct alpha variants for missing definitions and incompatible node kinds:

| Variant | Required information |
| --- | --- |
| `missingNode` | Schema identifier, the comparison side that lacks the definition, and the existing definition's kind |
| `nodeKind` | Schema identifier and the incompatible kinds on both comparison sides |

The following examples illustrate the payload shapes.
Record these differences in `allDiscrepancies` whether or not they block an operation.
Include them in a condition-specific subset only when they contribute to its flag being false.
The variant names are illustrative; finalize them with the diagnostic unions.

```typescript
const missingDefinition = {
    mismatch: "missingNode",
    location: { nodeType: "example.Point" },
    missingFrom: ["target"],
    stored: { kind: "object" },
};

const incompatibleKinds = {
    mismatch: "nodeKind",
    location: { nodeType: "example.Point" },
    view: { kind: "object" },
    stored: { kind: "leaf" },
};
```

Use consistent `view`, `stored`, and `target` labels across all lists.
For `missingNode`, `missingFrom` identifies all absent sides. Include a kind description only for sides with a definition.

Include only the minimum structure needed to explain the difference.
Do not attach complete node definitions, field lists, or allowed-type lists to these variants.
Do not recursively expand the failed definition or emit a diagnostic for each descendant.
Full schema inspection is a separate concern.

Record differing node kinds in the complete list even when a kind transition is supported.
Include `nodeKind` in a condition-specific subset only when that check rejects the transition itself.
When different kinds can be compared under the existing policy, include specific field failures in that subset instead.
Continue comparing other schema identifiers after either variant is emitted.

## Completeness Rules

1. Compare the root and all available schema definitions, including definitions unreachable from the root.
2. Continue after a difference or failure to collect differences in other fields and definitions.
3. Record each distinct field-kind and allowed-type difference when both comparisons apply.
4. Preserve absent-versus-explicitly-forbidden representation differences in the complete list. Keep their compatibility effects consistent with existing policy.
5. Record missing definitions in the complete list. Classify their absence as a blocker only when the existing policy rejects it.
6. For differing node kinds, report the schema identifier and both kinds. For a missing definition, report the identifier, absent side, and existing kind.
7. Do not invent child comparisons between structures that have no meaningful correspondence.
8. Compare other definitions even when one node has incompatible kinds.
9. Identify definitions once by schema identifier. Do not expand recursive references without a limit.
10. Use stored field keys in locations. Preserve the distinction between root, object fields, and map fields.
11. Collect all equivalence failures even when viewing or upgrading already fails.
12. Include reverse-comparison failures that prevent equivalence when viewing and upgrading both succeed.
13. Limit each condition-specific entry to the aspects that fail its check and the information needed to explain them. Split independent differences before classification.
14. Record staging and schema metadata differences even when all compatibility checks accept them.
15. Emit each distinct discrepancy once in the complete list. Every condition-specific entry must be an unchanged entry from that list.

Represent a missing definition or differing node kinds with one bounded diagnostic per distinct difference, not per failed check.
Do not include schema snapshots or expand missing definitions into descendant entries.
Where structures correspond, compare their staging and metadata even when a content comparison has already failed.

## Implementation Design

### Authoritative Compatibility Analysis

The first draft preserved the original compatibility calculations and then collected complete diagnostics in a separate pass.
The collector used viewing failures from the first pass and independently repeated some stored-schema comparison rules.
This protected existing results during the initial addition, but it duplicated semantic work.

Consolidate these paths before considering lazy evaluation or other performance optimizations.
Use one authoritative analysis to produce compatibility decisions and the diagnostic information that explains them.
Derive the flags from its blocker subsets:

```typescript
const canView = diagnostics.view.length === 0;
const canUpgrade = diagnostics.upgrade.length === 0;
const isEquivalent = diagnostics.equivalence.length === 0;
```

Do not derive flags from `allDiscrepancies`, which also contains accepted differences.
Do not only replace the flag assignments while leaving duplicate compatibility implementations in place.
Diagnostic formatting, deduplication, and ordering must not determine compatibility policy.
Every failed semantic check must produce at least one corresponding blocker.

Preserve the dependency between staged-upgrade accounting and target construction:

1. Analyze the view and stored schema once to collect viewing decisions, beta diagnostic details, alpha comparison details, and staged-upgrade enablement.
2. Construct the effective upgrade target using the configured policy and already-enabled upgrades.
3. Analyze the stored-to-target and target-to-stored comparisons using shared authoritative modular-schema rules that also produce failure details.
4. Assemble the complete list and blocker subsets from those results, derive the flags, and expose subsets only when their flags are false.

More than one traversal is permitted when a later stage depends on earlier results.
The objective is to avoid evaluating a compatibility rule once for a boolean and independently evaluating it again for diagnostics.
Retain comparison details from the first stage where needed instead of repeating its semantic decisions.
Keep internal modular-schema results independent of public alpha types.
Preserve boolean-only callers and their early-exit behavior where practical through the same comparison rules.

Produce beta and alpha reports from the shared analysis without treating beta output as a direct formatting of alpha entries.
Preserve beta grouping, staging context, diagnostic detail, and relative ordering.
Preserve staged-upgrade location counts and partial or enabled statuses.
Do not count locations again when emitting additional diagnostics.

Use the checked-in first draft as a temporary test oracle during consolidation.
Record its revision before changing production code.
Keep oracle comparisons in tests or test tooling, not as a second production calculation.
For each comparison, verify that its blocker list is empty if and only if the original check succeeds.
Verify exact flag agreement and beta-output preservation independently of the new flag derivation.
Existing tests that only compare a derived flag with its own blocker list are not sufficient to prove compatibility preservation.
After agreement is established, remove redundant production boolean checks and duplicated classification rules.
Retain independent regression expectations without maintaining a second permanent policy implementation.

### Consolidation Results

The temporary differential baseline is commit `3905cd61102adff4ba4945091e42fa1d0cddd02d`.
The comparison tools loaded the baseline modules from Git in memory.
No baseline policy implementation remains in production or test files.

The viewing walk supplies raw failures, beta details, and staged-upgrade location counts before target construction.
The diagnostic collector reuses these viewing decisions without repeating their policy checks.
It separately discovers accepted structural, staging, and metadata differences for the complete list.
The modular-schema layer supplies located failures for both stored-schema comparison directions.
Boolean-only callers consume the same comparison iterators and stop at the first failure.
The collector maps semantic failures to shared complete-list entries and asserts that no failure lacks an entry.
The checker derives all three flags from the blocker subsets.

Differential verification matched the baseline for 4,802 schema and policy combinations, including flags, exact beta output, and upgrade statuses.
A second check matched 104,991 modular-schema cases across node, repository, and field comparisons.
These cases included recursive, missing, forbidden, identifier, and unconstructible definitions.
Permanent regression tests cover complete failure locations, multiple failures at one field, detached definitions, map and object directionality, leaf values, and constructibility rejection.
Tree source and test compilation pass after a forced project-reference rebuild removed stale incremental output.
The affected comparison, viewing, staging, helper, live-view, and benchmark smoke suites pass with 416 tests passed and 11 pending.
The current and legacy API-report checks pass without report changes.
Eager evaluation remains unchanged.
The recorded performance measurements still describe the first draft, not the consolidated implementation.

### Complete List And Classification

Separate discrepancy discovery from compatibility classification.
Inspect original schema data before transformations remove staging annotations or persisted metadata.
Compare content constraints, staging, and persisted metadata as distinct aspects.
Never traverse non-persisted metadata to discover discrepancies.
Also retain the effective upgrade target needed to explain directional compatibility failures.
Associate failures with complete-list entries without duplicating a difference for each check.

Inspect what schema data each entry point receives and what its conversions retain.
Do not discard metadata available in persisted inputs before collecting differences.
Do not infer original staging annotations that a persisted format does not contain.
Document the compared representations and the information available to each helper.
Use the JSON-compatible contract of `persistedMetadata` for metadata payloads.
Do not introduce an arbitrary-value encoder or an uncompared-value variant for non-persisted metadata.

Add staging and metadata variants to the shared alpha union.
Identify metadata locations and distinguish missing values from present values, including null.
Compare structured metadata by value, not object identity or object-key insertion order.
Keep persisted metadata differences out of all blocker subsets; existing compatibility rules ignore them.
Include a staging difference in a blocker subset only when the existing staging rules make it relevant.

Collect each difference at sufficient granularity for whole-entry subset selection.
Classify using the existing predicates, retaining any check-specific bookkeeping internally.
Deduplicate by discrepancy identity and order the complete list deterministically.
Produce each condition-specific list by filtering it, preserving its relative order.
Neither diagnostic discovery nor classification may change the existing flags or staged-upgrade status.

### Viewing Report

Extend or factor the existing discrepancy walk to separate comparison details from beta output.
Preserve existing beta diagnostics, their details, and their relative ordering.
Preserve the beta rule that `discrepancies` is `undefined` when viewing is allowed.
Additional beta diagnostics or details are permitted when viewing is blocked.
Do not apply alpha filtering to the beta output or remove its existing non-blocking context.
Collect the additional details for missing fields and other incomplete cases.
Exclude accepted staged differences and allowed unknown optional fields from both alpha viewing entries and their contents.

Keep staged-upgrade location collection separate from diagnostic emission.
Additional diagnostics must not count the same upgrade location twice.
Do not change upgrade status as an incidental effect of this work.

### Upgrade Report

Add diagnostic collection beside the existing comparison rules in the modular-schema layer.
Keep internal diagnostics independent of the public simple-tree API types.
Convert internal results to alpha API types in the simple-tree layer.

Share the existing predicates for allowed types, field-kind transitions, and node comparisons.
Do not create a second implementation of upgrade policy.
Preserve the default monotonic upgrade rules, which prevent repeated upgrades between equivalent forms.
Preserve the existing treatment of missing definitions and types that cannot contain valid content.

Use the exact upgrade target used by the existing `canUpgrade` calculation.
This includes enabled staged upgrades and `includeAlreadyEnabledUpgrades`.
Collect every applicable failure without changing the boolean result.
Retain early-exit behavior for callers that request only a boolean where practical.

### Equivalence Report

Collect the complete set of failures from all three checks used by `isEquivalent`.
Reuse the complete viewing and upgrade results.
Also collect failures from `allowsRepoSuperset(policy, wouldUpgradeTo, stored)`.
Do not derive this report only by combining the viewing and upgrade reports.
Those reports do not explain failures in the reverse comparison.

Use the same effective upgrade target and comparison policy as the existing boolean calculation.
Use the shared modular-schema diagnostic collection for the reverse comparison.
Preserve its directional field-kind rules and treatment of types that cannot contain valid content.
Evaluate every check for diagnostics even when the existing boolean expression would stop early.
Do not change `isEquivalent` to require raw structural equality or metadata equality.

Map all equivalence failures to the corresponding complete-list entries.
Include each relevant entry once, even when it fails multiple internal checks.
Do not expose check labels or duplicate entries for different comparison directions.
Exclude differences accepted by every check from equivalence entries and their contents.
Include a staged difference only when it causes an equivalence check to fail.

### Status And Exports

Update the cached status and getter in [schematizingTreeView.ts](../../src/shared-tree/schematizingTreeView.ts).
Evaluate all three checks for initialized and uninitialized trees.
Construct each status with `allDiscrepancies` and condition-specific subsets only for flags that are false.
Refresh the flags and reports together when the stored schema changes.
Omit reports for checks that now succeed, including after a previous failure.
Preserve existing event and disposal behavior.

Extend the alpha APIs [checkCompatibility](../../src/simple-tree/api/snapshotCompatibilityChecker.ts) and [comparePersistedSchema](../../src/simple-tree/api/storedSchema.ts) to expose all four lists in this change.
Always expose the complete list, and use the same false-only access and runtime property-absence rules for subsets as the alpha view status.
Preserve their inputs, comparison rules, and existing compatibility results.
Keep `canInitialize` excluded because these helpers compare schemas, not document initialization state.

Preserve the discriminated unions in the helper return types.
Do not apply ordinary `Omit` to the combined alpha status because it loses union-specific diagnostic properties.
Instead, omit `canInitialize` from the beta base before intersecting it with `ViewableStatus`, `UpgradeableStatus`, `EquivalenceStatus`, and the `allDiscrepancies` property.
Keep helper results assignable to their existing return type, `Omit<SchemaCompatibilityStatus, "canInitialize">`.
Test narrowing for each flag and verify that `canInitialize` is not exposed.

Inspect exact-object assertions and snapshot consumers for new enumerable properties.
Do not update snapshots without checking each change.

Export new types through the existing export chain.
Generate entrypoint sources and API reports with repository tools.
Do not edit generated files by hand.
Use the repository API-change guidance and add a changeset when required.

### API Scope Documentation

Document the metadata exclusion in the TSDoc for `SchemaCompatibilityStatusAlpha.allDiscrepancies`, the shared alpha diagnostic type and its persisted-metadata variant, and both `checkCompatibility` and `comparePersistedSchema`.
Ensure the alpha view's compatibility documentation links to this scope definition.
State that `allDiscrepancies` covers the compared schema representations, not non-persisted custom metadata or descriptions.
State that persisted metadata differences are reported but do not affect compatibility flags.
Explain that staging annotations remain in scope despite being represented internally as metadata.
Include an example contrasting an ignored non-persisted metadata change with a reported persisted metadata change.
Do not imply that excluding metadata is a comparison failure or that callers must restrict their existing custom metadata values to JSON.

## Test-First Sequence

For each step, write one focused test and run it before changing production behavior.
Confirm that the failure concerns the intended behavior, not test setup or stale build output.
Make the smallest change that passes the test.
Refactor only after the focused tests pass, then run them again.

1. **Protect existing behavior.** Add characterization tests for beta output, compatibility flags, and staged-upgrade status. Run them on the unchanged implementation. Require retention of all existing beta diagnostics and details, including non-blocking context. Permit reviewed additions without weakening these retention checks.
2. **Add the alpha contract.** Add type tests for alpha-to-beta assignability and the alpha view's status override. Test unconditional access to `allDiscrepancies` and false-only access to each subset. Reject subset access before narrowing and in the true branch. Reject all new properties through beta types. Test readonly flags and arrays. Test the always-present complete list, absent successful subsets, and nonempty failed subsets before adding the types and fields.
3. **Discover and classify differences.** Test fields in both directions, absent and forbidden representations, staging, and metadata. Test accepted differences with all flags true. Verify unique entries and unchanged subset membership, including mixed blocking and non-blocking allowed-type differences. Add alpha detail without reducing beta detail.
4. **Complete node details.** Test the bounded payloads for missing definitions and rejected node-kind transitions. Verify that accepted kind transitions produce only applicable field failures. Test multiple failures and recursive definitions without expanding failed definitions. Preserve shared-identifier checks beyond root reachability.
5. **Explain upgrade failures.** Add tests for each failed comparison in the modular-schema layer. Add public-format tests in the simple-tree layer.
6. **Explain equivalence failures.** Test reverse-comparison failures when viewing and upgrading succeed. Test failures across all three checks to prove that collection does not stop early. Verify equivalent schemas can have complete-list entries without an equivalence subset. Verify one difference that fails multiple checks appears only once in each list.
7. **Check staged policy.** Test enabled and disabled upgrades and preservation of upgrades already enabled. Verify unchanged upgrade-location counts. Verify that equivalence diagnostics use the effective target in both directions.
8. **Check integration.** Test alpha view access, initialization, schema changes, `checkCompatibility`, and `comparePersistedSchema`. For both helpers, test return-type assignability, narrowing for all three flags, exclusion of `canInitialize`, unconditional complete-list access, subset absence on success, and complete subsets on failure. Test retention of staging and metadata available to each entry point.
9. **Consolidate compatibility analysis.** Follow the authoritative-analysis design above before optimization. Establish a differential baseline against the checked-in first draft, then consolidate viewing analysis and staged-upgrade accounting. Share diagnostic-producing modular-schema rules for both target comparison directions. Verify exact flags, beta output, upgrade statuses, and empty-subset equivalence before deriving flags from blockers and removing redundant production checks. Cover missing and forbidden fields, accepted staging, unknown optional fields, recursive and unconstructible types, unreachable shared identifiers, supported cross-kind comparisons, reverse-only failures, and non-blocking metadata.
10. **Evaluate performance.** After consolidation and correctness validation, compare the eager implementation with the recorded first-draft and pre-change benchmark baselines described below. Investigate material regressions. Keep the deferred performance decision separate from consolidation. Add lazy computation and caching only after that decision, when measurements justify them, with focused tests before optimization.
11. **Run the final checks.** Run package compilation, tests, formatting, lint, and API checks. Review generated output and documentation before requesting approval to merge.

Reuse [schemaCompatibilityTester.spec.ts](../../src/test/simple-tree/api/schemaCompatibilityTester.spec.ts) and nearby suites.
Prefer existing test helpers and comparison tests over new test files.

## Required Test Cases

| Case | Required result |
| --- | --- |
| Identical schemas with no detected differences | `allDiscrepancies` is present and empty; all three subsets are absent; beta `discrepancies` remains `undefined` |
| Equivalent schemas with accepted staging or metadata differences | Complete list records those differences; all three subsets are absent when all flags are true |
| Metadata additions, removals, and changed nested values | Complete list identifies the location and values, distinguishes absence from null, and preserves existing compatibility flags |
| Non-persisted node or field metadata differs | No entries in any list and no flag changes, including custom metadata and descriptions |
| Non-persisted custom metadata contains functions, symbols, cycles, or throwing getters | Comparison and report serialization do not traverse these values or throw because of them |
| Helper inputs retain different non-persisted metadata | Both helpers ignore it consistently while reporting available persisted metadata and staging differences |
| One allowed-type difference blocks a check while another is accepted | Complete list uses separate entries; the subset selects only the blocking entry |
| Every condition-specific subset | Each entry occurs unchanged in the complete list; no duplicates or public check labels; subset may equal the complete list |
| Each flag narrowed to false or true | Its alpha report is accessible only in the false branch; flags cannot be assigned |
| Alpha status used as beta status | Assignment and the alpha view's status override compile; beta types do not expose alpha reports |
| Alpha comparison helper return types | Both helpers retain assignment to their existing return types, preserve false-only diagnostic access for each flag, and exclude `canInitialize` |
| Alpha comparison helper results | Both helpers omit successful checks' diagnostic properties and return complete nonempty reports for failed checks; results match the shared checker for the same inputs and policy |
| Existing beta diagnostics gain detail | All previous diagnostics and details remain; additions do not change compatibility flags |
| Viewing and upgrading succeed but the reverse comparison fails | Viewing and upgrade diagnostic properties are absent; equivalence report explains every reverse-comparison failure |
| Failures in viewing and both stored-schema comparison directions | Equivalence report includes every applicable failure despite earlier failures |
| One discrepancy fails multiple checks | One complete-list entry appears once in each applicable subset, including equivalence |
| Structurally different schemas accepted by every equivalence check | Complete list records the differences; equivalence diagnostic property is absent |
| New optional field in the view | Viewing report explains the field; upgrade diagnostic property is absent when upgrade is valid |
| Unknown optional stored field accepted by the view | Viewing diagnostic property is absent; upgrade report explains loss of the field when applicable |
| Missing field versus explicitly forbidden field | Complete list preserves representation differences; blocker classification follows existing policy |
| Missing definition that fails a comparison | `missingNode` identifies the schema, absent side, and existing kind without a schema snapshot |
| Node-kind transition rejected by policy | `nodeKind` identifies the schema and both kinds without descendant diagnostics; other definitions are still compared |
| Different node kinds with a supported comparison | Complete list records the kind difference; subsets contain specific field failures when applicable, not an accepted kind transition |
| Allowed-type removal and field-kind restriction together | Upgrade report includes both failed comparisons |
| Several failures across the root and node definitions | Reports include all applicable failures |
| Object-to-map and map-to-object changes | Diagnostics follow the existing directional upgrade rules |
| Shared identifier with incompatible unreachable definitions | Viewing rejection remains; upgrade follows the existing repository comparison |
| Unrelated unreachable stored definition | No new viewing blocker; upgrade reports its removal when the current rule rejects it |
| Non-blocking staged type accompanies a blocking difference | Beta retains its context; complete list has a separate staging entry; subsets omit that entry wherever it is accepted |
| Staged optional field versus required stored field | No new viewing blocker for the accepted kind difference |
| Staged-upgrade policy changes the target | Upgrade and equivalence details describe the effective target |
| Missing or unconstructible types | Boolean results match the existing comparison rules |
| Recursive schema and renamed property keys | Traversal terminates; locations use stored keys |
| Uninitialized tree and later schema update | Reports match the current status and refresh with it |
| A check changes from failure to success or success to failure | Its diagnostic property is absent on success and present with a nonempty report on failure |

Across the existing comparison cases, assert that `allDiscrepancies` is always present and contains each detected difference once.
Assert that each condition-specific diagnostic property is absent exactly when its corresponding flag is true.
When the flag is false, assert that the property is present and its report is nonempty.
Also assert exact diagnostics for representative failures.
Property-presence and length assertions alone do not prove completeness.
For condition-specific subsets, assert that entries contain no accepted differences and match complete-list entries without payload changes.
For beta reports, assert retention of the existing diagnostic information while allowing reviewed additions.

## JSON Serialization

All four alpha diagnostic lists must support `JSON.stringify` without a custom replacer.
Use plain objects, arrays, and JSON-compatible primitive values throughout diagnostic payloads.
Do not include Maps, Sets, functions, symbols, bigint values, or cyclic references.
Represent schema references by identifiers rather than live schema objects.
Omit optional properties when they have no value so serialization does not discard diagnostic information.

Document this contract in the diagnostic API TSDoc, with examples of unconditional complete-list access and narrowing before serializing a subset.
JSON serialization support does not establish a versioned persistence format or a canonical property order.

Before implementing the diagnostic payloads, add round-trip tests using `JSON.parse(JSON.stringify(report))`.
Assert that every variant in each report retains its diagnostic information after the round trip.
Cover schema identifiers and field keys that require JSON escaping, and diagnostics for recursive schemas.
Cover staging and metadata entries, including nested metadata and absent-versus-null values.
Verify unique complete-list entries and value-based subset membership after round trips; JSON does not preserve shared object identity.
Test serialization of the alpha view status and both comparison helpers' results.
Verify that successful checks' diagnostic properties remain absent and failed checks' reports remain nonempty after serialization.

## Diagnostic Ordering

Make all four alpha lists deterministic for the same schema content and comparison policy within a library version.
Schema construction or insertion order must not change the diagnostic sequence.
Apply this requirement to nested collections, such as lists of conflicting type identifiers.
Choose the sorting rules as implementation details, not public API contracts.

Document that ordering is deterministic, but array position does not indicate severity or priority.
Do not promise a specific sorting rule or the same sequence across library versions.
This requirement does not impose canonical JSON object-key ordering or byte-for-byte stable JSON across versions.
Preserve the existing relative-order requirement for beta diagnostics; do not apply alpha sorting to beta output.

Before implementing ordering, add tests that repeat a comparison and vary insertion order for node definitions, fields, and allowed types.
Assert identical alpha report sequences, including nested collections, for otherwise identical inputs and policy.
Cover all four lists, including staging and metadata, and verify that subsets preserve complete-list relative order.
Retain checks for the relative order of existing beta diagnostics.

## Performance

### Initial Measurements

The initial eager implementation and baseline used the same dev container and benchmark framework.
These are local measurements, not performance guarantees.
The baseline predates the production changes. All times below are per comparison.

| Schema | Baseline, flags only | Eager, flags only |
| --- | --- | --- |
| 10 identical fields | 19.1 us | 53.4 us |
| 10 fields, first differs | 14.4 us | 58.2 us |
| 10 fields, all differ | 20.4 us | 95.6 us |
| 100 identical fields | 133.9 us | 272.9 us |
| 100 fields, first differs | 101.5 us | 253.2 us |
| 100 fields, all differ | 159.1 us | 741.1 us |
| 1,000 identical fields | 1.35 ms | 2.62 ms |
| 1,000 fields, first differs | 0.977 ms | 2.33 ms |
| 1,000 fields, all differ | 1.52 ms | 7.26 ms |

The first eager collector took 25.6 ms for 1,000 differing fields.
Indexing viewing failures by location removed a quadratic scan and reduced this to approximately 7.3 ms.
Identity checks also avoid formatting unchanged scalar values.

The expanded suite contains 65 cases. It measures flags, one subset, all lists in both access orders,
repeated list access, and JSON serialization. It also measures staging, metadata size, a standalone helper,
live-view creation, cached status access, and schema-change recomputation.

Additional eager results:

| Operation | Time |
| --- | --- |
| 1,000 differing fields, serialize status | 16.31 ms |
| Metadata-only difference, 10 nested entries, flags only | 43.8 us |
| Metadata-only difference, 100 nested entries, flags only | 336.0 us |
| Metadata-only difference, 1,000 nested entries, flags only | 3.57 ms |
| Metadata-only difference, 1,000 nested entries, serialize status | 4.48 ms |
| Staging-only difference, flags only | 17.8 us |
| Standalone helper, staging-only difference | 32.3 us |
| Live-view creation and disposal, empty content | 27.1 us |
| Cached live-status access | 73.6 ns |
| Live schema recomputation, empty content | 17.8 us |

The live-view fixtures exclude content hydration. The creation measurement includes disposal.
The metadata fixtures vary metadata size independently of field count.
Allocation volume, retained memory, and garbage-collection cost have not been measured separately.
The expanded access-pattern and live-view cases do not yet have matching pre-change baselines.
The short measurements are useful for identifying costs but need repeated runs for an acceptance decision.

Run the benchmark from `packages/dds/tree` after building source and tests:

```sh
FLUID_TEST_PERF_MODE=1 pnpm exec mocha --no-config \
    --conditions=allow-ff-test-exports --timeout 30000 \
    --reporter @fluid-tools/benchmark/dist/mocha/Reporter.js \
    lib/test/simple-tree/api/schemaCompatibility.bench.js
```

The eager collector remains in place. No lazy getters or new caches have been added.
The remaining flags-only cost is material in the stress cases.
Performance acceptance and any deferred-evaluation work remain open.
The user deferred this decision until correctness, builds, exports, and the remaining branch work are complete.
Keep eager evaluation until that review.

### Evaluation Strategy

Start with eager diagnostic computation.
Do not add lazy getters, cache infrastructure, or new early-exit paths without measured need.
However, keep the implementation compatible with later lazy computation without changing the public API.
Always-available properties specify access, not when their values must be computed.

### Implementation Boundaries

Keep compatibility predicates, discrepancy collection, classification, and public formatting separate where practical.
Share comparison rules rather than implementing different policies for flags and diagnostics.
Avoid making boolean-only callers depend on formatted diagnostic arrays.
Exhaustive collection requirements apply when producing diagnostics; they do not require a boolean-only traversal to continue after its result is known.
Do not build a general execution framework or additional caches merely to prepare for possible optimization.

Keep computation associated with one schema-and-policy snapshot.
Identify which inputs are immutable and which require capture if evaluation is deferred later.
Include original metadata, staging information, and the effective upgrade target in this analysis.
A retained status must not combine old flags with diagnostics from a later schema state.
Do not add speculative deep copies of schema data; measure snapshot capture and retention costs if lazy evaluation becomes necessary.

Avoid incidental diagnostic reads in flag-only paths.
Audit object spreads and status forwarding, including `computeCompatibility`, because these operations can invoke future enumerable getters.
The public contract must permit cached accessors while preserving JSON serialization and property absence on successful checks.
Serialization and object spreading may intentionally materialize available lists; do not promise that these operations are cheap.

### Benchmark Gate

Capture the existing implementation's baseline before production changes.
Reuse repository benchmark tools and nearby performance suites.
Compare the baseline and eager implementation using the same runtime, fixtures, warmup, and repeated measurements.
Include small representative schemas and larger stress cases, varying schema size separately from metadata size.

Cover identical schemas, early incompatibility, many differences, staging-only differences, metadata-only differences, and large nested metadata.
Measure live view creation, schema-change recomputation, and repeated standalone helper calls.
Include flags-only use, first access to one subset, access to all lists in different orders, repeated access, and JSON serialization.
Measure latency and, where tooling permits, allocation volume, retained memory, and garbage-collection cost.
Report absolute costs as well as relative changes; distinguish schema processing from document hydration and unrelated setup.

Review the measured impact on representative workflows before accepting the implementation.
Agree on acceptable costs from those results rather than inventing an unmeasured percentage threshold.
Keep the eager implementation if its cost is acceptable.
If a material regression remains, use the measurements to choose the smallest optimization and repeat the same benchmarks.

### Conditional Lazy Optimization

If benchmarks justify deferral, allow each diagnostic list to be computed on demand and cached for its status snapshot.
Flags may use early-exit comparisons while their complete blocker lists are collected only when requested.
The current viewing walk also collects staged-upgrade locations and beta diagnostics.
Do not stop that walk early without preserving complete upgrade accounting and the existing beta diagnostic contract through an appropriate path.

Cache completed lists and reusable internal comparison results to avoid repeated work across related requests.
Do not require a subset request to materialize unrelated metadata diagnostics or the entire public complete list unless measurements favor that approach.
Preserve value-based subset membership, uniqueness, and deterministic ordering regardless of access order.
Use a new computation context for a new schema state; do not invalidate a retained status into observing newer inputs.
Account for the memory cost of keeping deferred inputs and cached results alive.

Before implementing laziness, test repeated access, subset-first and complete-list-first access, and serialization before and after property reads.
Use internal computation counters where practical to detect redundant collection or formatting.
Test retained statuses across schema changes and verify snapshot consistency, conditional property absence, beta detail, and staged-upgrade counts.
Do not expose cache controls or evaluation timing as public API requirements.

## Validation

Build source output before compiling tests after production changes.
Tests consume emitted source declarations.
Use the dependency-aware package build if dependency output is missing.

For focused work, run these commands from the Tree package:

```sh
npm run build:esm
npm run build:test:esm
pnpm exec mocha --no-config --conditions=allow-ff-test-exports lib/test/simple-tree/api/schemaCompatibilityTester.spec.js
```

Use the repository test configuration for tests that require shared hooks.
Expand the focused test set to include touched comparison and view suites.
Finish with the package build and full test suite.
Run API report generation and export checks for the new alpha types.

## Acceptance Criteria

- New functionality is exposed only through alpha APIs.
- All four lists satisfy the completeness rules above.
- `allDiscrepancies` is always available and includes each distinct schema difference once, including staging and schema metadata.
- Each condition-specific property is absent from the true type branch and runtime object when its corresponding flag is true.
- Each condition-specific property is available in the false branch and contains at least one blocker at runtime.
- The flags and arrays are readonly. Only the condition-specific subsets require narrowing the corresponding flag to false.
- The alpha status remains assignable to beta, and the alpha view's status override type-checks.
- `checkCompatibility` and `comparePersistedSchema` expose all four lists with the same narrowing and runtime presence contracts as the alpha view status.
- Helper return types preserve existing assignability and continue to exclude `canInitialize`.
- Subsets contain unchanged complete-list entries and include only blockers and the information needed to explain them.
- No list contains duplicate discrepancies or public check-specific indicators. Classification is internal.
- Accepted staging and metadata differences can leave all flags true while `allDiscrepancies` is nonempty.
- The equivalence report includes failures from viewing and both stored-schema comparison directions without stopping early.
- `canView`, `canUpgrade`, and `isEquivalent` retain their existing results.
- Compatibility flags derive from blocker subsets produced by one authoritative semantic analysis, not parallel boolean-only and diagnostic implementations.
- Each blocker subset is empty if and only if the corresponding original compatibility check succeeds, verified against independent expectations.
- Staged-upgrade enablement is available before target construction, without duplicate location accounting.
- Consolidation preserves beta output and public API shapes and does not introduce lazy evaluation or new caches.
- Beta `discrepancies` retains its contract and at least its current diagnostic detail, including non-blocking context.
- Additional beta diagnostic information is permitted; removal of existing information is not.
- Deprecation of beta `discrepancies` remains a future decision.
- Staged-upgrade status retains its existing results.
- Diagnostic types distinguish the view schema from the upgrade target.
- Diagnostics handle recursive schemas and shared identifiers correctly.
- Missing-definition and node-kind diagnostics use bounded payloads without schema snapshots or recursive expansion.
- All four alpha lists support JSON serialization without a custom replacer or loss of diagnostic information, including staging and metadata entries.
- API documentation describes JSON serialization, and tests cover round trips and conditional property absence.
- API documentation states that non-persisted metadata is excluded, while persisted metadata and staging differences are in scope.
- Tests verify that excluded node and field metadata is not traversed or reported, including arbitrary non-JSON values, across the applicable entry points.
- Alpha reports and their nested collections have deterministic ordering independent of schema insertion order, verified by tests.
- API documentation does not promise specific sorting rules or ordering stability across library versions.
- Pre-change and eager-implementation benchmarks cover representative latency and memory risks; measured regressions are reviewed before acceptance.
- The eager implementation preserves practical boundaries for later lazy evaluation without adding speculative cache infrastructure.
- If measurements justify lazy computation, caching prevents redundant work and tests verify snapshot consistency and access-order independence.
- Tests cover each new diagnostic before its implementation.
- Documentation and test comments use Simplified Technical English.
- API documentation follows the repository TSDoc Guidelines.
- Required builds, tests, lint, and API checks pass.

## Review Decisions

The following design decisions are agreed.
The initial implementation is checked in; the consolidation described above is the next phase.

1. **Agreed, updated:** Add `allDiscrepancies` alongside the three condition-specific properties. Use a shared diagnostic element model; the sketch uses the provisional name `SchemaDiscrepancyAlpha`.
2. **Agreed, updated:** Keep discriminated unions and false-only access for the three subsets. Always expose `allDiscrepancies`, including when all flags are true.
3. **Agreed, updated:** Use bounded missing-definition and node-kind variants in the complete list, including accepted differences. Include them in subsets only when they block the corresponding condition. Report field failures for supported cross-kind comparisons.
4. **Agreed:** Extend `checkCompatibility` and `comparePersistedSchema` in this change. Preserve diagnostic narrowing and existing return-type assignability, and continue to exclude `canInitialize`.
5. **Agreed:** Require documented and tested JSON serialization and deterministic ordering. Keep specific sorting rules as implementation details, with no ordering stability guarantee across library versions.
6. **Agreed, updated:** Record each distinct discrepancy once in `allDiscrepancies`, including staging and persisted metadata. Exclude non-persisted metadata, including custom metadata and descriptions, consistently across entry points and document that scope in the APIs. Model viewing, upgrade, and equivalence reports as subsets of unchanged entries, without public check labels or duplicates. Preserve existing equivalence semantics and keep classification internal.
7. **Agreed:** Implement eagerly first and benchmark against the existing behavior. Prepare practical boundaries for lazy computation, but add deferral, caching, and early-exit optimizations only when measurements justify their complexity.
8. **Agreed:** Consolidate compatibility decisions and diagnostics before optimization. Derive flags from authoritative blocker subsets while preserving the staging dependency, existing compatibility semantics, beta output, and upgrade accounting. Validate against the checked-in first draft before removing duplicate production checks.

This update records the consolidation plan only.
Do not start its implementation as part of this planning update.
