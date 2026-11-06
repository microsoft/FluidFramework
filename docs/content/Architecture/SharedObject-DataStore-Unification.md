# Shared object and data store unification

## Status and purpose

**Draft for review.**
The requirements below record the agreed compatibility goals for unifying shared objects and data stores in the alpha ServiceClient API.
The validation plan and implementation sequence are proposals for satisfying those requirements, not claims of completed support.
Review this contract before further implementation or switching the alpha factories.

The goal is to let you use framework-provided shared object kinds and application-defined data store kinds through the same creation, registry, and root-selection abstractions.
The goal is not merely to hide different runtime restrictions behind TypeScript types.
Existing shared objects, including distributed data structures (DDSs), and existing data stores must retain their supported behavior.
The main alpha API should remain clean, simple, and expressive for recommended application patterns.
Legacy-only expressiveness may be provided through a separate compatibility surface rather than added to the main API.

**Adopting the new API and adopting a new document capability are separate actions.**
Using the alpha API for an existing capability must not itself require a different document representation.

Relevant starting points:

- [ServiceClient API](../../../packages/common/driver-definitions/src/serviceClient.ts).
- [Data store definition and root initialization](../../../packages/dds/shared-object-base/src/dataStoreKind.ts).
- [Shared object kinds](../../../packages/dds/shared-object-base/src/sharedObject.ts).
- [Runtime channel contracts](../../../packages/runtime/runtime-definitions/src/dataStoreContext.ts).

## Scope and compatibility boundaries

This work must let you write applications using the new alpha APIs that open documents created using older APIs.
Old-API and new-API applications must be able to collaborate when they use capabilities supported by both applications and the configured framework-version target.
You still supply application-compatible factories, type identifiers, schemas, and initialization logic.
The framework is not expected to infer arbitrary application formats.
You may use designated compatibility APIs alongside the main alpha API to express legacy application definitions.

These are different compatibility dimensions:

1. **API surface:** whether application code uses older APIs or the alpha APIs.
2. **Framework version:** whether the participating framework implementations understand a capability and its persisted and operation formats.
3. **Application code:** whether the application's factories, schema, and behavior understand that capability.
4. **Document representation:** which layouts, identities, and formats the document actually uses.

An application using an older API surface is not necessarily running an older framework version.
A sufficiently recent framework version does not prove that the application code is ready for a feature.

Stability of the alpha API signatures and documents created specifically with those experimental APIs is not an independent requirement.
The use cases already possible through those APIs must remain possible.
This exception does not remove compatibility requirements for established legacy application formats.

### Main API and legacy compatibility surface

Supporting migration does not require recommending every legacy pattern for new applications.
Separate the following responsibilities:

| Category | Scope |
| --- | --- |
| Main alpha API | Provide clean, simple abstractions for recommended application patterns and the unified placements. Do not require legacy-only configuration in this surface where it can be separated. |
| Required compatibility bridge | Provide an API tagged both `@legacy` and `@alpha` that lets a legacy data-store implementation participate in the new alpha APIs. It may support legacy options directly or expose the legacy types needed to use existing legacy APIs. This bridge is part of this project and enables incremental migration without restructuring documents. |
| Deferred compatibility helpers | More convenient legacy+alpha helpers may later reduce dependence on lower-level legacy APIs. They are not required in this project unless needed to satisfy the contract and not covered by the bridge. Record needs as TODOs and add helpers when actual customer needs justify them. |

Application-selected channel names are the currently identified example of legacy-only expressiveness.
Do not assume other cases belong in this category without identifying and evaluating them.

A future helper for named channels may support finding, editing, and collaborating on existing content without supporting creation of new content with application-selected names.
**Existing-content-only does not mean read-only.**
An old-API peer may create more named channels during collaboration; the migrated application must be able to consume that content and subsequent edits through the compatibility path.
The main alpha API need not expose equivalent creation options.
The bridge may continue to use an existing legacy implementation's creation logic through the legacy APIs.

TODO: If customer needs justify it, design a legacy+alpha helper for working with named channels in existing documents without requiring new applications to adopt named-channel creation.
Do not implement that convenience helper speculatively as part of this project.

## Requirements

Use the requirement IDs in implementation notes and tests.
When changing a requirement, record the decision here rather than silently relaxing an acceptance test.

| ID | Requirement |
| --- | --- |
| R01 | **Unified capabilities.** Both kinds must be usable in every placement in the placement matrix, subject to capability-specific compatibility checks. Exposing a type that the implementation cannot support is insufficient. |
| R02 | **Preserve existing capabilities.** Use cases already supported by the alpha APIs must remain supported. API names and signatures may change; preserving those signatures is not the objective. |
| R03 | **No API-induced format migration.** For capabilities already supported by older APIs, applications adopting the new APIs must be able to operate on the established document layout and operation formats without requiring relocation, renaming, or synthetic objects. Legacy-only options, including application-selected channel names and associated root selection, may be expressed through designated legacy+alpha APIs or existing legacy APIs exposed by the compatibility bridge; they need not appear in the main alpha surface. Do not force legacy documents to adopt a new fixed root convention. |
| R04 | **Bidirectional legacy interoperability.** With compatible application definitions, old-API and new-API clients must read each other's edits and summaries for their shared capability set. Opening an old snapshot once is not sufficient. |
| R05 | **Framework-version enforcement.** Reject a genuinely new capability when the configured oldest supported client version cannot support it. Do not publish unsupported operations or persisted state, silently insert an adapter, or bypass the version setting. The gate must follow the capability or format actually used, not the choice of API surface. |
| R06 | **Application rollout remains separate.** Applications must control use of features their older application code does not understand. Framework-version validation must not be presented as an application-readiness check. Tests must distinguish these two conditions. |
| R07 | **Prefer native generalization.** Generalize the underlying implementation rather than introducing artificial hosting data stores, pointer DDSs, or document-wide wrapper roots solely to make the API work. Recommend an adapter only if native generalization is intractable, with explicit review of interoperability, persistence, migration, and maintenance costs. |
| R08 | **Preserve identity and lifecycle.** Preserve existing object identities, handle paths, factory lookup, attachment, operation ordering, connection behavior, signals, and disposal semantics. Cover reconnect, resubmission, stashed operations, staging, and rollback where supported by the participating kinds. |
| R09 | **Defined containment and GC behavior.** New physically nested data stores initially share the containing data store's aggregate garbage-collection lifetime. A descendant reference must retain the required ancestors. Do not change existing documents' retention semantics merely to unify the API. Independent collection of every nested object is outside this project's initial scope. |
| R10 | **Separate identity from application values.** A data store's output may be an arbitrary application-facing value. Root designation, persistence, and attachment must not depend on that value exposing `.handle`, implementing `IFluidLoadable`, or accepting infrastructure properties. |
| R11 | **Consistent factories and registries.** Unify keys, registry use, and creation behavior without losing lazy loading or factory identity validation. Preserve existing factory identifiers, package paths, and supported synchronous legacy paths through the compatibility surface where necessary, even if the main API is asynchronous and does not expose every legacy option. |
| R12 | **Explicit failure.** Unsupported capabilities, conflicting factories, and invalid input must produce appropriate repository-standard errors. Do not disguise an unsupported configuration with a successful-looking fallback. |
| R13 | **Separate compatibility expressiveness.** Deliver a legacy+alpha bridge for using legacy data-store implementations with the new alpha APIs. Keep legacy-only configuration out of the main surface where possible. The bridge must support the required incremental migration and interoperability without adding persisted wrapper objects. Specialized compatibility helpers may be deferred with TODOs and may support existing content without offering equivalent creation APIs. |

R03 does not require byte-identical summaries.
Normal compatible changes to summary metadata or encoding are permitted.
Validation must compare the application-visible topology, identity paths, format compatibility, and behavior, not incidental serialization details.

R07 does not forbid every in-memory compatibility bridge.
Document and justify such bridges as part of the design.
The R13 bridge is a required API interoperability mechanism, not a substitute for native support of the unified placements.
An in-memory facade does not make an additional persisted wrapper object a native representation.
The fluid-static document layout is not a model to reproduce.

## Placement matrix

The baseline column describes the alpha API before this project, not the capability of the internal building blocks now on the branch.
Every row is a required end-state capability.
Legacy-only configuration within these placements may use the R13 compatibility surface.
The matrix does not require every legacy option to appear in the main alpha API.

| ID | Placement | Alpha baseline | Acceptance boundary |
| --- | --- | --- | --- |
| P01 | Data store as container root | Supported | Preserve established factory, root-discovery, and identity conventions when adopting the new API, using the compatibility bridge where needed. |
| P02 | Shared object as container root | Not directly supported | Provide native hosting without an artificial parent data store. Gate any genuinely new representation or runtime requirement. |
| P03 | Additional data store created through the container | Supported | Preserve detached creation, attachment through references, and existing data-store lifetime semantics. |
| P04 | Additional shared object created through the container | Not directly supported | Provide native non-root hosting. Test references, lazy loading, and collection, not only root aliasing. |
| P05 | Shared object as a data store's root | Supported with a named-root convention | Preserve existing DDS layouts and application-defined legacy root selection through the compatibility path where needed, without a forced document rewrite or a requirement for named-channel creation in the main API. |
| P06 | Data store as another data store's root | Not supported | The root can be a real composite child, with persistence and identity independent of its exposed value. Gate new nesting. |
| P07 | Additional shared object created through a data store | Supported | Existing DDS child formats and lifecycle behavior must remain usable with the new API. |
| P08 | Additional data store created through a data store | Not exposed by the alpha context | Support genuine native nesting with aggregate lifetime. Retain existing legacy peer-creation behavior through legacy APIs or the compatibility surface where that behavior is explicitly requested. |

Creation scope and physical containment are different.
The existing legacy child-factory path can create a container-level peer selected through a hierarchical registry.
That is useful existing behavior, but it does not demonstrate P06 or physical nesting in P08.
Do not silently substitute peer creation when the contract calls for containment.

## Compatibility matrix

In this table, application definitions are compatible unless the row says otherwise.
"Older supported framework" means a version included by the configured oldest-supported-client contract, not every historical release.
An application using the new API may also use the R13 compatibility bridge; it need not express its entire legacy layout through the main alpha API.

| Scenario | Required outcome | Requirements |
| --- | --- | --- |
| An old-API application created the document; a new-API application opens it and uses only established capabilities | Works without an API-induced layout migration, using the compatibility bridge where necessary. | R02-R04, R08, R13 |
| Old-API and new-API applications use the same current framework packages and only established capabilities | Bidirectional edits and summary reloads work. This isolates API/layout compatibility from version skew. | R03, R04, R08 |
| An older supported framework participates with a current framework using the new API, within their shared capability set | Bidirectional edits and summary reloads work with compatible application definitions. | R03-R06, R08 |
| A new-API application creates a document using an established legacy-compatible layout supported for creation by the main API or a bridged legacy implementation; an old-API application opens it | Works. Do not validate only the old-writer/new-reader direction. This does not require every future existing-content compatibility helper to offer creation. | R03, R04, R13 |
| A new-API application requests a genuinely new capability while targeting a framework version that cannot support it | Reject before publishing unsupported state or operations. | R05, R12 |
| All frameworks can support a new capability, but some participating application code cannot | The application rollout policy must prevent use until application readiness is established. A framework-version check alone is not evidence of readiness. | R06 |
| Framework targets and application rollout both permit a new capability | The capability works, including its complete lifecycle and summary reload. | R01, R05, R06, R08-R11 |
| An older application creates more legacy-format content after a new-API client has joined | The new client can consume the newly created content and subsequent edits through the compatibility path where needed; compatibility is not snapshot-only. | R03, R04, R08, R11, R13 |
| An application needs application-selected channel names solely for legacy interoperability | The compatibility surface may expose the option or the legacy types needed to use existing APIs. The main alpha API is not required to offer named-channel creation. | R03, R13 |
| A document was created specifically with an experimental alpha-only format | No independent stability guarantee for that format. Established legacy-format requirements and preservation of supported use cases still apply. | R02-R04 |

## Validation plan

The following acceptance groups are planned.
Passing a few tests within a group does not complete the group.
Map individual tests to requirement IDs and placement IDs as they are added.

| ID | Acceptance group | Required evidence | Requirements |
| --- | --- | --- | --- |
| V01 | Legacy document adoption | Fixtures created through real older API paths, including application-selected root names, existing DDS children, and factory package paths. Open, edit, summarize, and reload through the new API and its compatibility bridge without relocating content. Do not require a specialized named-channel helper when the bridge suffices. | R02-R04, R08, R11, R13; P01, P03, P05, P07 |
| V02 | Mixed-API collaboration | Distinct old-API and new-API application implementations in the same session. Both create content through their supported creation paths and edit; both can reload summaries produced by either side. Include compatible signals, handle exchange, and legacy-shaped content created by the old-API peer after the new client joins. | R03, R04, R08, R11, R13 |
| V03 | Framework-version compatibility | Run representative mixed-API scenarios against pinned supported framework versions. Record the actual versions and minimum-version target. Exercise the boundary below each new capability's support threshold. | R04-R06, R12 |
| V04 | All placements and outputs | Exercise P01-P08 through the unified alpha API, including lazy kinds and data-store outputs without handles. Verify root creation and reload, not merely assignability of types. | R01, R02, R10, R11 |
| V05 | Identity and representation | Assert exact expected handle paths, factory identifiers, and meaningful snapshot structure. Prove the absence of synthetic hosting/pointer objects and retain legacy shapes when no new capability is used. | R03, R07, R08 |
| V06 | Attachment and recovery | Cover detached creation and rehydration, descendant-only references, remote attachment, reconnect, resubmission, stashed operations, supported staging/rollback, and disposal. Include previously unloaded objects. | R08, R10, R11 |
| V07 | Garbage collection | Verify aggregate lifetime for new nesting, ancestor retention, unchanged legacy retention, and deletion of the containing store when unreachable. Exercise GC execution and summary reload, not only the shape returned by `getGCData`. | R08, R09 |
| V08 | Rejection and rollout | Unsupported-version requests produce clear errors without unsupported persisted output or submitted operations. Test the application-controlled feature gate separately from the framework gate. | R05, R06, R12 |
| V09 | Registry and format failures | Cover conflicting factory identities, ambiguous identifiers, lazy loading, invalid persisted metadata, and stable factory selection across create/load paths. | R08, R11, R12 |
| V10 | API and regression validation | Type tests for the unified surface; existing legacy API and runtime regressions; regenerated API reports; directly related documentation and changesets when the customer-facing API changes. | R01, R02, R04, R11 |
| V11 | Compatibility bridge and API separation | Use a legacy data-store implementation through the legacy+alpha bridge with the new alpha APIs. Verify incremental migration, unchanged identity/layout, editing and collaboration, and reuse of legacy initialization logic where needed. Check release tags and entrypoints so legacy-only configuration need not leak into the main alpha surface. Deferred convenience helpers are not completion criteria. | R03, R04, R07, R11, R13 |

### Fixture and test discipline

For each compatibility fixture or scenario, record:

- Writer API, framework version, application factory/schema version, and root-selection convention.
- Reader API and framework version.
- Compatibility bridge or legacy APIs used for legacy-only configuration, and whether a helper supports creation or existing content only.
- The document's relevant topology and format, and the intended capability set.
- The configured oldest supported client version and the application's feature-readiness condition.
- Which client creates content, sends operations, and produces each summary.
- The requirement and placement IDs covered.

Do not generate both sides using the new implementation and call the result legacy compatibility.
Test both same-version/different-API behavior and genuinely older supported implementations.
A historical snapshot fixture does not replace live collaboration tests.
Type casts or proxy objects in tests must not conceal extra persisted nodes or missing runtime support.

### Evidence currently available

The following results were obtained during implementation before this documentation change.
They have not been rerun for this documentation-only commit.
Both new end-to-end suites use `NoCompat`; they do not prove mixed-framework-version compatibility.

| Evidence | Observed result | What it establishes | What it does not establish |
| --- | --- | --- | --- |
| [Native leaf tests](../../../packages/test/test-end-to-end-tests/src/test/leafChannels.spec.ts) | 7 tests passed in the combined run below. | Internal direct leaf hosting; root and non-root handles; summary structure and reload; reconnect; stashed operations; staging rollback; SharedTree ID-compressor use. Partial V04-V06. | Unified alpha API support; legacy-layout adoption; old-API/new-API collaboration; older framework support; complete GC coverage. |
| [Native collection tests](../../../packages/test/test-end-to-end-tests/src/test/nativeChannelCollections.spec.ts) | 7 tests passed in the combined run below. | Internal nested leaves/composites; ancestor attachment; aliases and summary reload; composite roots; hosting a legacy data-store implementation as a child; stashed operations and rollback; a compatibility-target rejection. Partial V04-V08. | Migration of an existing legacy parent layout; collaboration between an old parent implementation and a migrated one; historical framework compatibility; full GC collection behavior. |
| Existing nested-store and aliasing suites in the same run | 5 tests passed; 19 end-to-end tests passed in total. | Selected existing behavior still works alongside the new internal tests. | The full interoperability contract in R03-R06. |
| Runtime context, child-creation, and collection suites | 39 tests passed. | Selected existing runtime behavior and leaf reference-source tracking. | Complete cross-version or alpha-surface validation. |

Exact successful end-to-end command, from [test-end-to-end-tests](../../../packages/test/test-end-to-end-tests):

```sh
MOCHA_SPEC=lib/test/nativeChannelCollections.spec.js npm run test:realsvc:local -- --compatVersion=0 lib/test/leafChannels.spec.js lib/test/dataStoresNested.spec.js lib/test/aliasWithProps.spec.js
```

Exact successful runtime test command, from [container-runtime](../../../packages/runtime/container-runtime):

```sh
MOCHA_SPEC=lib/test/channelCollection.spec.js npm run test:mocha:esm -- lib/test/dataStoreContext.spec.js lib/test/createChildDataStoreSync.spec.js
```

The affected ESM implementations and tests were compiled before those runs.
API reports were regenerated for datastore, runtime-definitions, and container-runtime without report changes.
These results are baseline evidence, not completion of the acceptance groups above.

## Assessment of the current implementation

Two commits provide internal building blocks:

- `463284e3eae`: direct shared-object hosting at a channel identity.
- `d2d84154338`: native nested channel collections with aggregate lifetime.

The alpha factories have not been switched to these implementations.
The building blocks are not an approved final architecture and may need revision to meet this contract.

In particular:

- The native collection currently uses data-store-style contexts for its children.
  Switching every existing DDS child position to that representation would violate R03 when the old application expects the established DDS representation.
- The current native collection has a blanket `3.12.0` oldest-supported-client requirement.
  That is an implementation boundary for the current helper, not a requirement that every application adopting the alpha API target that version.
  Final feature thresholds and gate locations must follow proven runtime and format requirements.
- A test that nests an existing legacy data-store implementation under a new collection does not demonstrate migration of a document whose parent uses a legacy layout.
- The current tests do not establish preservation of legacy signal behavior, live creation of legacy children, or complete GC behavior across mixed implementations.
- Existing alpha named-root conventions do not establish that application-defined legacy root layouts can be used without rewriting them.
  The required legacy+alpha bridge may supply this capability; the main API does not have to expose all of those layout options.
- The runtime tests do not establish the required application-facing legacy+alpha bridge or the separation of legacy-only options from the main alpha surface.

Do not resolve these gaps by silently substituting container-level peers for nested children, preserving only a read-only legacy loader, or marking same-implementation tests as interoperability evidence.
An existing-content-only compatibility helper can still satisfy editing and collaboration requirements; it is not the read-only loader excluded here.

## Decisions to resolve during design review

These are implementation decisions, not permission to weaken the requirements:

1. How the required legacy+alpha bridge accepts legacy data-store implementations and exposes any legacy types needed for incremental migration, without forcing legacy-only options into the main API.
2. Which existing DDS and data-store representations the generalized hosting implementation handles directly, and which are handled by bridged legacy implementations, while preserving operations, signals, and content created by an old-API peer after loading.
3. Which formats or placements actually require a newer framework version, and the supported-version test matrix for each threshold.
4. How application-controlled feature rollout is expressed in examples and tested independently of framework-version validation.
5. How to unify keys and registries while preserving identity validation, historical identifiers, and supported synchronous legacy paths through the compatibility surface where necessary.
6. How aggregate GC and ancestor attachment integrate with existing retention, tombstone, and sweep behavior.

For any proposed adapter used instead of native placement support, record the native alternative considered, why it is intractable, the added persisted or observable structure, effects on mixed-API collaboration, and the path for later migration away from the adapter.
Obtain agreement before selecting it over native generalization.
This does not defer the required R13 compatibility bridge.
Record further compatibility-only cases as they are discovered; named channels are the only identified example so far.

## Implementation and review gates

1. Review and agree on this document.
2. Add representative legacy-layout fixtures and mixed-API test implementations, and implement the required legacy+alpha data-store bridge before switching the alpha factories.
3. Evaluate the two runtime commits against those tests, and revise the common hosting machinery where necessary.
4. Implement missing placements and capability-specific version checks without changing established representations merely because a different API is used.
5. Unify the alpha kinds, keys, registries, creators, and root definitions, keeping legacy-only configuration on the compatibility surface where possible.
6. Complete the mapped acceptance groups, regenerate API reports, update documentation, and add the appropriate changeset.

At each commit-sized milestone, record the requirements covered, exact validation commands and results, remaining gaps, and any intentional compatibility change.
Keep completed evidence separate from planned coverage.
The project is complete only when the compatibility matrix and placement matrix are exercised through the application-facing API, not merely through internal factories.
The application-facing API includes the required compatibility bridge.
Completion does not require speculative convenience helpers for legacy layouts.
