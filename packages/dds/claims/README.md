# @fluid-internal/claims

A distributed data structure (DDS) for first-writer-wins claim management with optional compare-and-swap (CAS) support.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is intended strictly as an implementation detail of the Fluid Framework and is not intended for public consumption.**
**We make no stability guarantees regarding its APIs.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Overview

The `Claims` DDS provides a key-value store with controlled write semantics:

-   **Write-once (claims):** Use `trySetClaim(key, value)` to claim a key. Once claimed, a key cannot be overwritten. This is useful for scenarios like aliasing, singleton creation, or task assignment where exactly one client should "win."
-   **Compare-and-swap (CAS):** Use `compareAndSetClaim(key, newValue)` to update a key's value. On the wire, the DDS uses per-key sequence numbers for conflict resolution, so concurrent writes are detected automatically.

Both modes are optimistic: when attached, a local op is submitted and a `"Pending"` result is returned with a promise that resolves once the server acknowledges the op. In detached mode, values are applied immediately and return an `"Accepted"` result. Operations are also permitted while disconnected — they are queued and resubmitted on reconnect.

## Usage

### Claiming a key (write-once)

```typescript
const result = claims.trySetClaim("singleton-component", componentHandle);

if (result.status === "AlreadyClaimed") {
	// Another client already claimed it; use claims.get(key) to read the winning value.
} else if (result.status === "Pending") {
	const confirmation = await result.promise;
	if (confirmation.status === "Accepted") {
		// This client successfully claimed the key.
	} else if (confirmation.status === "AlreadyClaimed") {
		// Lost the race; use claims.get(key) to read the winning value.
	}
}
```

### Compare-and-swap (CAS)

```typescript
const current = claims.get("config-key");
const result = claims.compareAndSetClaim("config-key", newConfig);

if (result.status === "Pending") {
	const confirmation = await result.promise;
	if (confirmation.status === "Accepted") {
		// Update succeeded.
	} else {
		// Another client updated first; retry with new value.
	}
}
```

### Events

```typescript
// Emitted when a claim is accepted (both write-once and CAS).
claims.events.on("claimed", (key: string) => {
	console.log(`Key ${key} updated to:`, claims.get(key));
});
```

## API

### `IClaims<T>`

| Method                                                                        | Description                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `trySetClaim(key: string, value: T): ClaimResult`                          | Write-once claim. Fails if key already exists.                 |
| `compareAndSetClaim(key: string, value: T): ClaimResult` | CAS update. Uses per-key sequence numbers on the wire for conflict resolution. |
| `get(key: string): T \| undefined`                                       | Get the current committed value for a key.                     |
| `has(key: string): boolean`                                                   | Check whether a key has been claimed (distinguishes unset from `undefined` values). |

### Result types

-   **`ClaimResult`**: `{ status: "Accepted" }` | `{ status: "AlreadyClaimed" }` | `{ status: "Pending", promise: Promise<ClaimConfirmation> }`
-   **`ClaimConfirmation`**: `{ status: "Accepted" }` | `{ status: "AlreadyClaimed" }` | `{ status: "Aborted" }`

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:clientRequirements=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

Fluid Framework client libraries support the platforms in this document.
These requirements are intentionally restrictive.
Within a major version series, we can relax these requirements, but we cannot make them stricter.
For a Long Term Support (LTS) version, we might need to support these platforms for several years.

Other configurations can work, but Fluid Framework does not support them.
If an unsupported configuration stops working, we do not classify this as a bug.
To request support for a configuration that is not listed, file an issue.
The product team will evaluate your request.
In the issue, specify the current status of the configuration:

-   The configuration works but needs official support.
-   The configuration does not work and requires changes.

### Supported Runtimes

-   Fluid Framework supports Node.js versions 22 and 24 while they receive [upstream support](https://nodejs.org/en/about/previous-releases).
    -   Fluid Framework will stop support for version 22 [when upstream support ends on 2027-04-30](https://github.com/nodejs/release#release-schedule).
    -   Fluid Framework does not support Node.js with the `--no-experimental-fetch` flag.
-   Fluid Framework supports modern browsers that support the ES2022 standard library.

### Supported Tools

-   [TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0):
    -   Fluid Framework supports all [`strict`](https://www.typescriptlang.org/tsconfig) options.
    -   Set the build targets (`lib`, `target`) to `ES2022` or later.
    -   Enable [`strictNullChecks`](https://www.typescriptlang.org/tsconfig).
    -   Fluid Framework does not support [configuration options deprecated in TypeScript 6.0](https://typescriptdocs.com/release-notes/TypeScript%206.0#breaking-changes-and-deprecations-in-typescript-6-0).
    -   Fluid Framework does not fully support `exactOptionalPropertyTypes`.
        If you enable this option, do not use `in`, `Reflect.has`, `Object.hasOwn`, or `Object.prototype.hasOwnProperty` to narrow members of Fluid Framework types.
        These methods can incorrectly exclude `undefined` from the possible values.
-   [webpack](https://webpack.js.org/) 5
    -   We do not require a specific bundler.
        Other bundlers that handle ES Modules can work, but we actively test only webpack.

### Module Resolution

In TypeScript `compilerOptions`, use [`Node16`, `Node20`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) module resolution.
These settings follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).

Do not use `Node10` module resolution.

### Module Formats

-   ES Modules:
    Use ES Modules to consume Fluid Framework client packages, including in Node.js.
-   CommonJS:
    Fluid Framework does not officially support CommonJS in version 3.0 or later.

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README?
Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for?
Please [file an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
