# API link transitions design

## Summary

Add two transition mechanisms to `PackageLink` and `ApiLink`:

-   A `newApi` prop permits a target to be absent from the active API documentation. The component renders inline code when the target is absent. When the target exists, the component renders a link and logs a warning that tells the author to remove `newApi`.
-   A `replacementApi` prop gives `ApiLink` a preferred API reference. The component tries this reference before the reference in `api`. It uses `api` as a fallback while published API documentation still contains the old name. When `replacementApi` resolves, the component logs a warning that tells the author to make the new reference permanent.
-   A `replacementPackage` prop gives `PackageLink` the same rename behavior for package names.

These mechanisms let a website change merge with its related API change. The website can then work before and after release artifacts contain the API change.

## Background

The website publishes from the `main` branch. Published API documentation models come from release branches. Therefore, website content on `main` can be newer than the API documentation that the website consumes.

A link to a new API fails until a release branch publishes an API model that contains the API. A link update for a renamed API has the inverse problem. The old name works before the new model is published, and the new name works after publication. There is no single current `ApiLink` value that works in both states.

## Goals

The design has these goals:

1. Permit documentation for a new package or API to merge before its API model is published.
2. Permit documentation for a renamed API to work with both the old and new API models.
3. Keep normal API links strict.
4. Keep invalid declaration references and ambiguous references as build errors.
5. Tell authors when a temporary transition prop is no longer necessary.
6. Resolve all links against the active documentation version.
7. Preserve the current output for existing component use.

## Non-goals

The design does not do these tasks:

-   It does not change API model publication or website deployment.
-   It does not permit arbitrary broken links.
-   It does not add a fallback URL supplied by an author.
-   It does not find renamed APIs automatically.
-   It does not validate an arbitrary `headingId` in `PackageLink`.
-   It does not make transition warnings fail the build.

## Proposed component API

### `PackageLink`

Add an optional `newApi` prop:

```tsx
export interface PackageLinkProps {
	children?: ReactNode;
	package: string;
	replacementPackage?: string;
	headingId?: string;
	newApi?: boolean;
}
```

An MDX file can link to a package that is not in the published model:

```mdx
<PackageLink package="new-package" newApi />
```

The package name remains unscoped. This rule is the same as the current rule.

An MDX file can prepare for a package rename:

```mdx
<PackageLink package="old-package" replacementPackage="new-package" />
```

`replacementPackage` contains the preferred unscoped package name. The `package` prop remains the fallback name. When the transition is complete, the author copies the `replacementPackage` value to `package` and removes `replacementPackage`.

### `ApiLink`

Add optional `newApi` and `replacementApi` props:

```tsx
export interface ApiLinkProps<
	TApiSelector extends string = string,
	TReplacementApiSelector extends string = string,
> {
	children?: ReactNode;
	package: string;
	api: ApiDeclarationReference<TApiSelector>;
	replacementApi?: ApiDeclarationReference<TReplacementApiSelector>;
	newApi?: boolean;
	headingId?: string;
}
```

An MDX file can refer to a new API:

```mdx
<ApiLink package="fluid-framework" api="NewApi" newApi />
```

Because `newApi` has the `boolean` type, MDX and JSX permit the shorthand `newApi`. This syntax is equivalent to `newApi={true}`. The shorthand is the preferred syntax.

An MDX file can prepare for a rename:

```mdx
<ApiLink package="fluid-framework" api="OldApi" replacementApi="(NewApi:class)" />
```

`replacementApi` uses the same declaration-reference grammar as `api`. An author specifies an API item kind with a TSDoc selector. For example, `(NewApi:class)` selects a class and `(NewApi:interface).method` selects a method on an interface. A separate API-kind prop is not necessary.

The `api` prop remains the fallback reference. When the transition is complete, the author copies the `replacementApi` value to `api` and removes `replacementApi`.

## Resolution behavior

All checks use the manifest for the active Docusaurus documentation version. A target can exist in one documentation version and be absent from another version.

### `PackageLink` behavior

A normal `PackageLink` keeps its current behavior. It creates the package URL without a manifest lookup.

A `PackageLink` with `replacementPackage` checks the replacement package first. If the replacement package does not exist, it uses `package`. When the replacement package exists, the component links to it and logs a warning to make the replacement permanent.

The following table applies when `replacementPackage` is not present:

| `newApi` | Package exists | Result                                                      |
| -------- | -------------- | ----------------------------------------------------------- |
| Not set  | Either state   | Render the current link. Existing broken-link checks apply. |
| `true`   | No             | Render the content as inline code. Do not throw.            |
| `true`   | Yes            | Render the link. Log a warning to remove `newApi`.          |

The following table applies when `replacementPackage` is present:

| Replacement package exists | Original package exists | `newApi`     | Result                                                                                          |
| -------------------------- | ----------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| Yes                        | Either state            | Either state | Link to `replacementPackage`. Log a warning to replace `package` and remove the temporary prop. |
| No                         | Yes                     | Either state | Link to `package`. Do not log a transition warning.                                             |
| No                         | No                      | `true`       | Render inline code. Do not throw.                                                               |
| No                         | No                      | Not set      | Render the current original-package link. Existing broken-link checks apply.                    |

If `replacementPackage` and `newApi` are both present, replacement resolution runs first. `newApi` controls only the final state in which neither package exists.

The manifest identifies package existence. It does not contain package-heading metadata. Therefore, `headingId` continues to use the normal Docusaurus anchor check.

### `ApiLink` behavior

`ApiLink` resolves `replacementApi` first when that prop is present. If the preferred reference is not found, it resolves `api`.

| `replacementApi` target           | `api` target   | `newApi`     | Result                                                                                |
| --------------------------------- | -------------- | ------------ | ------------------------------------------------------------------------------------- |
| Exists                            | Either state   | Either state | Link to `replacementApi`. Log a warning to replace `api` and remove `replacementApi`. |
| Does not exist                    | Exists         | Either state | Link to `api`. Do not log a transition warning.                                       |
| Not supplied                      | Exists         | `true`       | Link to `api`. Log a warning to remove `newApi`.                                      |
| Not supplied                      | Exists         | Not set      | Render the current link.                                                              |
| Does not exist or is not supplied | Does not exist | `true`       | Render inline code. Do not throw.                                                     |
| Does not exist or is not supplied | Does not exist | Not set      | Throw the current not-found error.                                                    |

If both `replacementApi` and `newApi` are present, replacement resolution runs first. `newApi` only controls the final state in which neither reference exists. This combination supports a new API that changes name before its first API documentation artifact is published.

### Errors that remain strict

A transition prop suppresses only a not-found result. The following conditions remain errors:

-   The declaration-reference syntax is invalid.
-   A selector is not supported.
-   A reference is ambiguous.
-   The component is outside a versioned Docusaurus document.
-   The active documentation version has no manifest.

This rule prevents `newApi` from hiding author errors. A kind or overload selector that is valid but has no matching target is a not-found result. This result can use the transition behavior.

## Display text

The fallback output is a React `<code>` element. This element uses the same inline-code styling as inline code in MDX. The component does not add literal backtick characters.

Each component preserves explicit `children`, including rich React content:

```tsx
<code>{children ?? defaultText}</code>
```

For `PackageLink` without `replacementPackage`, `defaultText` is the package name.

For `PackageLink` with `replacementPackage`, `defaultText` is always the replacement package name. This rule applies when the component links to the original package.

For `ApiLink` without `replacementApi`, `defaultText` is the selector-free dotted path from `api`. This behavior matches the current link text.

For `ApiLink` with `replacementApi`, `defaultText` is always the selector-free dotted path from `replacementApi`. This rule applies when the component links to the old target. It lets the visible documentation use the new API name before the new API documentation exists.

For example, this source:

```mdx
<ApiLink package="fluid-framework" api="OldApi" replacementApi="(NewApi:class)" />
```

renders visible text `NewApi` in both transition states. Before publication, the link points to `OldApi`. After publication, the link points to `NewApi`.

All transition states permit rich child content. The component puts the same child tree in the link or the inline-code fallback. Authors can use inline elements such as emphasis and API display formatting. Authors should not add an outer inline-code element because the fallback already creates one.

## Resolution API changes

The current `resolveApiLinkTarget` function throws the same not-found error for these cases:

-   The package or dotted path is absent.
-   A valid kind selector has no match.
-   A valid overload selector has no match.

The component must distinguish these cases from invalid or ambiguous references. Do not inspect error-message text.

Add a non-throwing not-found result to the resolver layer. One possible shape is:

```ts
export type ApiLinkResolution =
	| {
			readonly found: true;
			readonly target: ApiLinkManifestEntry;
			readonly defaultText: string;
	  }
	| {
			readonly found: false;
			readonly defaultText: string;
	  };

export function tryResolveApiLinkTarget(
	manifest: Readonly<ApiLinkManifest>,
	packageName: string,
	api: string,
): ApiLinkResolution;
```

`tryResolveApiLinkTarget` parses and validates the reference first. It throws for invalid, unsupported, or ambiguous references. It returns `found: false` only when no candidate matches a valid reference.

Keep `resolveApiLinkTarget` as the strict wrapper:

```ts
export function resolveApiLinkTarget(/* current parameters */): ResolvedApiLink {
	const result = tryResolveApiLinkTarget(/* current arguments */);
	if (!result.found) {
		throw new Error(/* current not-found message */);
	}
	return result;
}
```

This structure preserves the existing strict function and its error messages. It also gives the components a typed result for transition behavior.

The parser must expose selector-free `defaultText` even for a not-found reference. This data is necessary for new-API output and rename display text.

## Warning behavior

Use `console.warn` during server rendering. Docusaurus includes server-render output in local and continuous integration build logs.

Warnings should use stable and actionable text. Proposed messages are:

```text
[PackageLink] Package "new-package" exists in API documentation version "current". Remove the newApi prop.
```

```text
[ApiLink] API "fluid-framework/NewApi" exists in API documentation version "current". Remove the newApi prop.
```

```text
[ApiLink] Replacement API "fluid-framework/NewApi" exists in API documentation version "current". Set api="NewApi" and remove the replacementApi prop.
```

```text
[PackageLink] Replacement package "new-package" exists in API documentation version "current". Set package="new-package" and remove the replacementPackage prop.
```

The actual message must preserve selector syntax when it tells the author which value to put in `api`.

Use a module-level `Set<string>` to reduce duplicate warnings in one process. Include these values in the warning key:

-   Component type
-   Active documentation version
-   Package name
-   API reference, when applicable
-   Transition prop type

Only emit these warnings when `typeof window === "undefined"`. This rule prevents every reader from receiving author diagnostics in the browser console. Parallel Docusaurus workers can still produce more than one copy of a warning. Duplicate prevention is best effort and must not affect correctness.

Warnings are best-effort build messages. They must not fail the build. A later change can add a stricter cleanup mechanism if the team needs one.

## `headingId` behavior

`ApiLink.headingId` is deprecated. The new resolution order does not change that status.

When `headingId` is present, it overrides the generated heading ID for the target that wins API resolution. Authors should not use it for an API replacement transition because one override might not be correct for both targets. Qualified declaration references remain the supported solution.

`PackageLink.headingId` keeps its current behavior. One heading ID must work with both package targets during a package replacement transition.

## Implementation plan

### 1. Refactor API reference resolution

Update `website/src/apiLinkReference.ts`:

1. Separate reference parsing from candidate lookup.
2. Add `tryResolveApiLinkTarget` and `ApiLinkResolution`.
3. Return selector-free display text for found and not-found results.
4. Keep `resolveApiLinkTarget` as a strict compatibility wrapper.
5. Keep current ambiguity, parser, and selector errors.

### 2. Share active-version manifest lookup

Update `website/src/components/shortLinks.tsx`:

1. Add a helper that gets the active version and its manifest.
2. Use this helper in `ApiLink`.
3. Use this helper in `PackageLink` only when `newApi` is true.
4. Preserve the current normal `PackageLink` path construction.

The helper must keep the current errors for a missing version context and a missing manifest. Error text can name the calling component.

### 3. Add transition rendering

Update `PackageLink` and `ApiLink`:

1. Add the new props and TSDoc comments.
2. Implement the resolution tables in this document.
3. Render `<code>` for the permitted final not-found state.
4. Keep explicit children unchanged.
5. Use the preferred replacement reference or package name for default display text.
6. Preserve rich child content in link and inline-code output.

### 4. Add warning support

Add a small private warning helper in `shortLinks.tsx`, or in a nearby module if tests need direct access. The helper emits server-only, best-effort deduplicated warnings.

Do not add warning data to the generated manifest. The warning depends on component props, not on API model metadata.

### 5. Add documentation examples

Add contributor guidance for these props after implementation. State that both props are temporary. Include the required cleanup operation for each warning.

Do not add a new-API example to published product documentation only to test the component. Use unit tests for transition states.

## Test plan

Extend `website/test/unit/shortLinks.test.ts` and the resolver unit tests.

### Type tests

Verify these cases:

-   `newApi` is accepted by both components with JSX boolean shorthand.
-   `replacementApi` accepts a valid dotted reference.
-   `replacementApi` accepts a kind selector.
-   `replacementApi` rejects an invalid literal reference.
-   `replacementPackage` accepts a string.
-   Existing `api` type checks continue to work.

### `PackageLink` tests

Verify these cases:

-   Normal links keep their current output and do not require manifest data.
-   A missing new package renders `<code>` with default text when `newApi` is present.
-   A missing new package preserves explicit children when `newApi` is present.
-   An existing package renders a link when `newApi` is present.
-   An existing package logs the cleanup warning when `newApi` is present.
-   The warning includes the active version.
-   A missing `replacementPackage` target falls back to `package` without a warning.
-   An existing `replacementPackage` target wins and logs a cleanup warning.
-   Default text uses `replacementPackage` before and after the target exists.
-   Explicit rich children remain unchanged before and after the target exists.
-   If both package names are absent, `newApi` controls code output versus the current original-package link.

### `ApiLink` tests

Verify these cases:

-   A missing API renders `<code>` when `newApi` is present.
-   A missing API preserves explicit children when `newApi` is present.
-   An existing API renders a link and logs the cleanup warning when `newApi` is present.
-   A missing `replacementApi` target falls back to `api` without a warning.
-   An existing `replacementApi` target wins and logs a cleanup warning.
-   Default text uses `replacementApi` before and after the target exists.
-   Explicit rich children remain unchanged before and after the target exists.
-   If both references are absent, `newApi` controls code output versus an error.
-   A malformed preferred reference throws and does not fall back.
-   An ambiguous preferred reference throws and does not fall back.
-   A valid preferred selector with no match falls back.
-   A valid preferred overload with no match falls back.
-   Existing version, anchor, overload, and selector tests continue to pass.

### Warning tests

Mock `console.warn` and server rendering. Reset the warning-key set between tests through a test-only reset function or module reset. Verify warning content and deduplication.

Do not depend only on browser tests for warnings. The warnings are server diagnostics.

### Build validation

Run these website checks:

1. Unit tests.
2. TypeScript test compilation.
3. ESLint and Prettier checks.
4. A full Docusaurus build with generated API documentation.

The full build confirms that `<code>` output works in MDX server rendering and that warnings appear in build logs.

## Compatibility

The new props are optional. Existing MDX source and rendered output do not change.

The strict `resolveApiLinkTarget` export keeps its current behavior. New code uses `tryResolveApiLinkTarget` only when it needs transition behavior.

The generated manifest format does not change. Existing generated manifests remain valid.

The feature works independently for each active documentation version. A link with `newApi` can render as code in one version and as a link in another version. A warning identifies the version in which cleanup is possible.

## Alternatives considered

### Catch all resolver errors in the component

This option is small, but it can hide malformed and ambiguous references. It also depends on thrown error text to identify not-found results. Reject this option.

### Add a replacement URL

An author-supplied URL bypasses manifest validation and version handling. It can become stale. Reject this option.

### Put replacement aliases in the generated manifest

The API models do not contain the documentation author's old-to-new mapping. An alias file would add a separate data source and cleanup process. A component prop keeps the transition next to the affected content. Reject this option for the first implementation.

### Render plain text instead of inline code

Plain text does not identify an API symbol as clearly as existing MDX inline code. The requested fallback is inline code. Reject this option.

### Make a successful new-API link fail the build

A build error would force immediate cleanup, but artifact updates can occur without a matching website change. This behavior would recreate the current urgent failure. Use a warning instead.

## Cleanup workflow

For a new API or package:

1. Add the link with `newApi` in the website change that documents the new item.
2. The website renders inline code until the artifact contains the item.
3. A later website build logs a warning after the artifact contains the item.
4. Remove `newApi` in a cleanup change.

For a renamed API:

1. Keep the old reference in `api`.
2. Put the new qualified reference in `replacementApi`.
3. The website displays the new name and links to the old API documentation before publication.
4. The website links to the new API documentation and logs a warning after publication.
5. Copy the `replacementApi` value to `api` and remove `replacementApi`.

For a renamed package:

1. Keep the old package name in `package`.
2. Put the new unscoped package name in `replacementPackage`.
3. The website displays the new package name and links to the old package documentation before publication.
4. The website links to the new package documentation and logs a warning after publication.
5. Copy the `replacementPackage` value to `package` and remove `replacementPackage`.

## Resolved design decisions

1. Use `replacementApi` for API rename transitions.
2. Use best-effort build warnings. Do not add stricter cleanup enforcement now.
3. Support package rename transitions with `replacementPackage` in the first implementation.
4. Permit rich child content in all link and fallback states.
