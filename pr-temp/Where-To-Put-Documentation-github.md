## Overview

As with all large projects, the Fluid Framework requires a sizable amount of documentation.
That documentation lives in a number of different locations / systems.
It can sometimes be difficult to find the documentation you need.
Similarly, it can sometimes be hard to determine where new documentation should live.

This document aims to give simple guidance to make our documentation systems easier to navigate, and to ensure we have consistent policy with regards to where different forms of documentation should go.

## Documentation locations

The following are locations where Fluid Framework documentation can be found.
They are not presented in any particular order.

- [fluidframework.com](https://fluidframework.com/)
  - This is our customer-facing website.
    It is the public face of our product and is home to high-level overviews, samples, etc. to get users up-and-running on the framework.
- [Github Wiki](https://github.com/microsoft/FluidFramework/wiki)
  - This is the contributor-facing wiki for the [fluid-framework](https://github.com/microsoft/FluidFramework) repository.
  - It primarily contains documentation relevant to the open-source community, including contribution guidelines.
- Source-code documentation
  - In addition to the above, our source-code is also a vital component to our overall documentation story.
  - A tailored selection of our generated API documentation can be found on `fluidframework.com` [here](https://fluidframework.com/docs/apis/).

## Where should I put new documentation?

The above list gives us an idea of locations in which we can find relevant documentation, but it doesn't give a good idea of where to look for specific kinds of documentation.
Nor does it help us determine where new documentation should be created.

When adding new documentation, please consider the following:

### Microsoft-internal documentation

For our Microsoft contributors, remember that internal / confidential documentation **_must_** be published to a secure location.
If you have any questions about this, please refer to policy outlined on our `EngHub Wiki`.

Additionally, documentation like Microsoft team processes and policies should generally be published to an internal location like our `EngHub Wiki`, unless it is relevant to our open-source community.

### API-specific documentation

As a general rule, API documentation should live with the code.
It is important for developers working in the code to have immediate access to relevant documentation; they should not need to look elsewhere.
Additionally, we leverage [TSDoc](https://tsdoc.org/) alongside [API-Extractor](https://api-extractor.com/) to generate consumer-friendly API documentation based on our source-code comments.

> Note: Please always use `TSDoc` comment syntax for API members.
> Do not use `//` comments.

`TSDoc` is fairly powerful, and has a growing feature set.
Check out our [TSDoc guidelines](https://github.com/microsoft/FluidFramework/wiki/TSDoc-Guidelines) for recommendations on how to use it to its fullest.

Also refer to our language-specific source-code documentation guidelines.

- [TypeScript documentation guidelines](https://github.com/microsoft/FluidFramework/wiki/Documenting-TypeScript)
- [JavaScript documentation guidelines](https://github.com/microsoft/FluidFramework/wiki/Documenting-JavaScript)

#### Package Documentation

One slight exception to the above guidance is package-level usage documentation.

Consumers of our packages may first encounter them via [npmjs.com](https://www.npmjs.com/), or by navigating our [Github](https://github.com/microsoft/FluidFramework) from the web UI.
Both UIs use the package `README.md` files as their default view for a given package.
For this reason, it is important that package-level semantic overviews and basic usage instructions be available in the package READMEs.

At the same time, package-level semantic information should also be a part of our published API documentation.
For this reason, it is also important to include package-level semantic overviews in the package's root export module (index.js / index.ts).

- These comments should be `TSDoc`-formatted and annotated with the [@packageDocumentation](https://github.com/microsoft/FluidFramework/wiki/TSDoc-Guidelines#packagedocumentation) tag.

In the future, we plan on adding tooling to allow such package-level semantic overviews to be shared between the source-code docs and READMEs, etc.
But for now, we ask that you ensure you are including the relevant information in both places, such that our customers are able to easily find this information.

### Public usage documentation

Many of our customers are likely to discover us through our public website, `fluidframework.com`.
These customers are not going to dive directly into our repository or our API documentation.
Instead, they will want high-level introductions, overviews, and examples to begin using the product.

Such documentation should be added to the website via the [/docs](https://github.com/microsoft/FluidFramework/tree/main/docs) directory in the repository.

> Remember: these documents are public.
> They **_must not_** include internal / confidential information.

### Contribution Guidelines

Remember that the Fluid Framework is an open-source project!
Many of our contributors are not Microsoft employees and require access to our contribution guidelines.
Please ensure that any policy / guidelines regarding contributing to our repository are published to a public location.

Generally speaking, we recommend publishing such documentation to our `Github Wiki`.
Putting these documents in a single, central location makes them easier to find.

That said, there will be occasions in which an individual package will have its own unique contribution guidelines.
These should appear in the package's README, but should be limited to only the aspects that deviate from our common guidelines.
Limiting to only deviations will help reduce duplication, redundancy, and the potential of guidelines becoming stale.

### Repository / package workflow documentation

As with our contribution guidelines, it is imperative that our open source community have access to any repository / package workflow instructions.

Generally speaking, we recommend publishing such documentation in the appropriate `README.md` files in the repository.
It should be added to `READMEs` at the relevant scope.

I.e.

- Documentation pertaining to working with the entire repository should live in the root README.
- Documentation pertaining to one of the inner mono-repos should live in the mono-repo root README.
- Documentation pertaining to an individual package should live in that package's README.
