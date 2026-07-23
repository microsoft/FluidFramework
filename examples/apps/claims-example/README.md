# @fluid-example/claims-example

This example demonstrates the **Claims DDS** with a small "claim a key" UI. A fixed set of keys (`ClaimKey1`, `ClaimKey2`) is known up front, and each client can claim any key that is still unclaimed. Under the hood each key is paired with the **`IFluidHandle`** of a freshly created `SharedDirectory` (a real DDS) that records its owner, and the key is bound to that handle using first-writer-wins semantics — so the first client to claim a key wins, competing claims from other clients are rejected, and every client resolves the winning handle to the same shared object.

> **Why a fixed set of keys?** This mirrors how a partner like Pages would use Claims: to claim a small, known set of things per data object. Because the keys are known up front, nothing needs to be enumerated — the view checks the owner of each known key directly, so the example never has to discover keys or mirror them into a side structure.

> **Why this shape?** The Claims DDS is currently an internal building block. The intent is for it to eventually live inside every `PureDataObject`, reachable through an API on the data object itself. That API does not exist yet, so this example wires the Claims DDS up by hand inside a root data object (built on `@fluidframework/aqueduct`) that abstracts the Claims API behind a single `trySetClaim(key)` method. It therefore depends on the internal-only `@fluid-internal/claims` package and consumes the container/runtime plumbing through its `/legacy` entry points.

This example follows the external-views pattern: the container code establishes the model (`ClaimsDataObject`) but leaves the view code (`view.tsx`) and its binding to the model up to the consumer of the container (`app.ts`).

## What it shows

- **A data object that abstracts the DDS** — `ClaimsDataObject` (an aqueduct `DataObject`) owns a single Claims DDS and exposes just `claimant`, `getOwner`, and `trySetClaim(key)`. The known keys (`claimKey1`, `claimKey2`) are exported alongside it. The view never touches the Claims DDS directly.
- **Handle-based claiming** — the claim value is the `IFluidHandle` of a backing `SharedDirectory` (a real DDS), not a primitive. Claiming a key creates that `SharedDirectory`, records the owner on it, and claims the key with its handle.
- **First-writer-wins** — `trySetClaim` only succeeds if the key is currently unclaimed. Open the app in two browser tabs and race to claim the same key; only the first claim wins.
- **Switching to the winner on a lost race** — when a claim loses, the data object resolves the winning key's handle (via the Claims DDS) to read the owner recorded on the winner's `SharedDirectory` and report the actual owner.
- **Cross-client handle resolution** — every client resolves the winning handle to the *same* `SharedDirectory`, so all clients agree on the owner of each claimed key.

## ClaimResult overview

`ClaimResult<T>` is a discriminated union returned by `trySetClaim`:

| Status | Meaning | Available fields |
|--------|---------|-----------------|
| `"Accepted"` | Claim accepted synchronously (only in detached mode) | `currentValue: T` |
| `"AlreadyClaimed"` | Another client already claimed this key | `currentValue: T \| undefined` |
| `"Pending"` | Op is in-flight awaiting server confirmation | `promise: Promise<ClaimConfirmation<T>>` |

In a connected container, `trySetClaim` returns `"Pending"`; awaiting the promise yields a `ClaimConfirmation<T>` whose status is `"Accepted"`, `"AlreadyClaimed"`, or `"Aborted"`. `ClaimsDataObject.trySetClaim(key)` collapses that lifecycle into a simple `boolean` (whether this client won) for the view to consume. On `"AlreadyClaimed"` the data object resolves the winning key's handle (via the Claims DDS) to read and report the winner's owner.

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/claims-example`
1. In a separate terminal, start a Tinylicious server by running `pnpm tinylicious` in this directory.
1. If using codespaces in a browser, set tinylicious (port 7070) visibility to "public". "Private to Organization" will not work. See [sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port) for how to do this.
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
1. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Testing

```bash
    npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
  launch: {
    dumpio: true, // output browser console to cmd line
    slowMo: 500,
    headless: false,
  },
```

## Data model

The claims example uses the following distributed data structures:

-   Claims - exclusive key ownership, keyed by the claimed string, valued by a `SharedDirectory` handle
-   SharedDirectory - one per claimed key, holding its owner (plus the data object's own root directory)

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
