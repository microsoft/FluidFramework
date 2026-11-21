# Show inherited members on derived API types

**Status: proposal.** A reader looking at a derived type should be able to find its instance properties, events, and methods without opening each base type in turn.
The derived page should answer *what is available here*; the declaration that introduced a member should remain the one place that answers *what does it do*.
List inherited members alongside declared members in the existing Properties, Events, and Methods tables, so readers do not need to know where a member was declared to find it.
Keep the member name linked to its declaration and link to its declaring type in an optional **Inherited From** column.

## What a reader would see

Consider a reader that declares its own position but inherits its readiness flag and both overloads of `read` from its base class:

```typescript
declare class BaseReader {
	readonly ready: boolean;
	read(id: number): string;
	read(id: string): string;
}

declare class Reader extends BaseReader {
	readonly position: number;
}
```

| On the `Reader` page | What the reader sees | Where the links go |
| --- | --- | --- |
| Properties | `position`, with an empty **Inherited From** cell | The name links to `Reader.position`. |
| Properties | `ready`, with `BaseReader` in **Inherited From** | The name links to `BaseReader.ready`; the type links to `BaseReader`. |
| Methods | Both `read` overloads, with `BaseReader` in **Inherited From** | Each name links to its own overload; both type links go to `BaseReader`. |

The same rule applies when an interface extends another interface: show the inherited member where the reader looks for it, but keep its details with the declaring interface.

## What the current model makes possible

The [default transformations](../src/api-item-transforms/configuration/Transformations.ts) already route classes, interfaces, and type aliases through [`transformApiTypeLike`](../src/api-item-transforms/default-implementations/TransformApiTypeLike.ts).
It filters `apiItem.members` and uses those **direct declarations** for both summary tables and child details.
The [signature helpers](../src/api-item-transforms/helpers/Helpers.ts) already print `Extends` and `Implements`; neither display changes.
For member discovery, follow only the `extends` excerpts and supported alias targets, without appending inherited items to `apiItem.members`: the [document traversal](../src/api-item-transforms/TransformApiModel.ts) and the [website link manifest](../../../website/infra/api-markdown-documenter/api-link-manifest.mjs) use membership to establish ownership.
This feature is also separate from [`@inheritDoc` processing](../src/LoadModel.ts), which copies comment content onto a declaration that already exists.

I checked these cases against the installed `@microsoft/api-extractor-model` (7.33.16) and the [existing test report](../src/test/test-data/simple-suite-test/test-suite-a.api.json):

| Evidence | Design consequence |
| --- | --- |
| `TestClass` does not declare `sealedMethod`. Following `extendsType` resolves `TestAbstractClass`, which does declare it. | We have a real member to link to. With the default hierarchy its target is `test-suite-a/testabstractclass-class#sealedmethod-method`. |
| `TestInterfaceExtendingOtherInterfaces` has one direct method and three bases. `TestInterface` and `TestInterfaceWithTypeParameter<number>` resolve to interfaces; `TestMappedType` resolves to an alias. | A supported branch can produce useful results even when a sibling branch cannot. The generic base supplies both the canonical declaration and the argument `number` for its type parameter. |
| `TypeWithProperties` has `foo`, `bar`, and `baz` in its `typeExcerpt`, but its `members` array is empty. `IntersectionType` and `UnionType` also have excerpts and no member items. | Text that looks like a property is not enough: there is no canonical `TypeWithProperties.foo` item or heading to link to. |

The upstream `ApiItemContainerMixin.findMembersWithInheritance()` is useful prior art, not a drop-in solution.
It preserves same-owner overloads and reports incomplete results, but only follows class and interface `extends` edges.
It flattens competing names to one owner, does not traverse alias targets, and does not apply the documenter's visibility policy.
The implementation in the installed version also queues base types without a visited set.
A small resolver over public model APIs is preferable to recovering lost provenance from that flat list or running a TypeScript compiler against source files that documenter users may not have.

## Which edges and members to follow

| Starting declaration | Proposed behavior |
| --- | --- |
| Interface | Follow each `extendsTypes` entry and its bases. Include named instance properties, event properties, and methods, with their overloads. |
| Class | Follow `extendsType` through verified class declarations and include members and heritage from a visible interface merged with the class. A class extends a constructor **value**: a reference to a same-named interface or type alias alone does not establish the instances' type. Skip that edge rather than guessing. Mark protected inherited members with `protected`. |
| Forwarding type alias | Follow an alias chain or a named generic application such as `type A = Box<string[]>` when the target resolves to a supported class, interface, or forwarding alias. Title the source column **Declared By**: an alias names an existing type rather than inheriting from it. An interface may also name a supported alias as a base. |
| Other type aliases and expressions | Keep the existing signature and do not invent members. Defer intersections, even of named types: two constituents can refine the same property. Unions, mapped/conditional types, utilities such as `Pick`, indexed access, inline object types, and mixin calls are not equivalent to their first referenced type. |

The first version covers `Property`, `PropertySignature`, `Method`, and `MethodSignature`; use `isEventProperty` to keep events in their own table as today.
It does not add inherited statics, constructors, construct/call/index signatures, or private members.
Keep links to the original declarations, but show inherited property and return types in the derived type's context when the model allows it.
For example, `Box<string>` links to `Box.value` but displays `string` for a property declared as `T`.
Carry the base's arguments through the inheritance path; do not replace a method's own type parameters or guess when paths disagree.
If the type cannot be specialized reliably, show its original excerpt with “(as declared)”.

## Resolving and merging declarations

Add an internal resolver under [`src/api-item-transforms/utilities`](../src/api-item-transforms/utilities) that accepts a type-like API item and the normalized transformation configuration.
Its result should distinguish members declared on the current type from those found through a base type or forwarding alias.
Keep the original `ApiItem` for every link, including each overload; record the declaring type and relationship separately.
No synthetic `ApiItem` or modified parent pointer is needed.

1. **Resolve the outer type, not every reference in an excerpt.** Parse the excerpt as TypeScript type syntax. For a named type application, resolve the canonical reference on its outer name with `config.apiModel.resolveDeclarationReference(reference, undefined)`. In `Base<Argument>` the edge goes to `Base`, never `Argument`. Retain each argument's excerpt separately: even a complex argument that cannot be substituted must not discard the edge. If the outer expression is not a named reference, or its declaration is unavailable or unsupported, stop that branch. Never search by display name or fetch packages.
2. **Collect instance members by declaring type.** Group named instance declarations by name within a type; retain the member kind and all overloads in each group. A nearer declaration hides the entire more distant name group on that branch, even if the nearer declaration is filtered out. A static member does not hide an instance member.
3. **Merge multiple bases without inventing a winner.** Collapse arrivals at the same canonical declaration, as in a diamond or a re-export. If one owner redeclares a member from its ancestor, prefer the redeclaration. If independent bases declare the same name, show the distinct, qualified declaration links under that name rather than choosing a base by traversal order or combining signatures. Sort ties by canonical reference and same-owner overloads by numeric index. For a computed name whose identity cannot be established from the model, skip the match rather than equating display strings.
4. **Respect the publication boundary.** Use [`shouldItemBeIncluded`](../src/api-item-transforms/utilities/ApiItemVisibility.ts) on each traversed owner and each member to be linked. Stop at an excluded owner rather than exposing names through it. A known, filtered declaration still reserves its name: suppress its row without revealing an older declaration from a base type. Apply the same rules to release levels and package exclusions. For a partially visible overload group, link only the visible declarations.

Cache resolved edges and completed member groups for one normalized configuration, not across runs with different filters.
Keep a separate active-path set to detect cycles, including cycles through aliases; on a back edge stop, and do not cache that partial result as a complete one.
Memoization should avoid traversing every distinct path through a diamond while preserving each distinct declaration.
Report a broken reference or cycle once per source edge through the configured logger and continue with other branches.
Use verbose logging for intentionally unsupported shapes: an ordinary union alias should not turn a successful documentation build into a page of warnings.

## Rendering and compatibility

The internal [`getFilteredMembers`](../src/api-item-transforms/utilities/ApiItemTransformUtilities.ts) selects visible members for a type and, when inheritance is enabled, sorts declared and inherited members together by name, comparing digits numerically.
[`transformApiTypeLike`](../src/api-item-transforms/default-implementations/TransformApiTypeLike.ts) groups that result by kind for the summary tables. It uses only direct declarations, in their original order, for details.
Render each nonempty Properties, Events, or Methods table once, even when **all** its rows are inherited, as in `interface Derived extends Base {}`.
This means building summaries outside the `filteredChildren.length > 0` guard while continuing to build detail sections from direct declarations only.

Extend the [table helpers](../src/api-item-transforms/helpers/TableHelpers.ts) with a row view that pairs a declaration with its origin.
Reuse the [generic table builder](../src/api-item-transforms/helpers/TableCreation.ts) and the existing name, modifier, alert, and description cells; resolve summary comment links in the **declaring member's** context.
Keep the name cell linked to the canonical member. When at least one row comes from another type, add **Inherited From** (or **Declared By** for a forwarding alias) immediately after the name column.
Link that cell to the original declaring type and leave it blank for local declarations.
Build every origin-member or overload link with [`getLinkForApiItem`](../src/api-item-transforms/utilities/ApiItemTransformUtilities.ts) and the original declaration, so the configured document path, heading, URI root, and overrides still apply.
Do not call `generateChildContent` on inherited items.
This keeps member details, headings, files, and manifest entries canonical, whether the derived type itself is a page or a section.

Introduce an `includeInheritedMembers` transformation option in the [suite configuration](../src/api-item-transforms/configuration/DocumentationSuite.ts).
Recommend `false` by default for the first release to preserve existing output, and opt the [Fluid website](../../../website/infra/api-markdown-documenter/render-api-documentation.mjs) in explicitly after reviewing generated pages.
The [website layout](../../../website/infra/api-markdown-documenter/api-documentation-layout.mjs) already accepts item-specific sections; neither the Markdown renderer nor the link manifest needs a new feature.
Custom kind transforms remain in control of their output.

## Implementation and acceptance

1. **Resolver first.** Unit-test direct and transitive inheritance, an empty derived type, a diamond, unrelated same-name bases, local overrides, and same-owner overloads. Include protected members, hidden overrides, and different filters on the same loaded model. Assert declaration identities and relationships, not just displayed names.
2. **Add aliases and failure cases.** Test a cross-package base with both reports loaded and again with the base absent. Cover a generic where the argument also resolves, a forwarding alias chain, a cycle, a mapped alias, an inline object, a union, and an intersection. An unsupported edge must not create guessed members or prevent a resolvable sibling edge from contributing.
3. **Render behind the option.** The [type-like transform unit tests](../src/api-item-transforms/test/TransformApiTypeLike.test.ts) inspect the summary tables and detail sections directly, including the declaring-type and overload links on a forwarding alias.
   Assert that a declared property and an inherited property appear in the same Properties table, only the inherited row links to a type in **Inherited From**, and a type with no direct declarations still has the appropriate member tables.
   In flat, default, and member-per-document layouts, check that each inherited link reaches the emitted member heading or document, every inherited overload retains its target, and no separate inherited section or duplicate member details appear.
   The [Markdown end-to-end suite](../src/test/MarkdownEndToEnd.test.ts) explicitly enables the option so its snapshots show what readers will see if it becomes the default.
   The [resolver unit tests](../src/api-item-transforms/utilities/test/InheritedMembers.test.ts) check the original declarations and their specialized types directly.
   The [member selection tests](../src/api-item-transforms/utilities/test/ApiItemTransformUtilities.test.ts) separately check that omitting the option still excludes inherited members.
   The [snapshot helper](../src/test/EndToEndTestUtilities.ts) writes new baselines on mismatch; inspect the diff before accepting it.
4. **Preview the website before enabling it.** Compare a derived interface, a derived class, and a generic base in a versioned documentation build. Check the rendered links, diff the manifest (no new derived aliases), and compare generation time and output size on the same report set. Enable the option for the site once the links work and the added summaries are useful at that scale.

## Follow-up work

- Handle `implementsTypes` and contract notes separately: `implements` checks a contract rather than supplying members. Link matching class members to their interface declarations and distinguish interface-only declarations from members the class actually exposes.
- Include static members
- For overridden members, display a notice and link to the canonical source of the overridden member.
