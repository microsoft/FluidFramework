# @fluidframework/counter

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluidframework/counter
```

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `@fluidframework/counter` like normal.

To access the `legacy` APIs, import via `@fluidframework/counter/legacy`.

## API Documentation

API documentation for **@fluidframework/counter** is available at <https://fluidframework.com/docs/apis/counter>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## SharedCounter

The `SharedCounter` distributed data structure (DDS) is used to store an integer counter value that can be modified by multiple clients simultaneously.
The data structure affords incrementing and decrementing the shared value via its `increment` method. Decrements are done by providing a negative value.

The `SharedCounter` is a specialized [Optimistic DDS][].
It operates on communicated _deltas_ (amounts by which the shared value should be incremented or decremented), rather than direct changes to the shared value.
In this way, it avoids the pitfalls of DDSes with simpler merge strategies, in which one user's edit may clobber another's (see [below](#why-a-specialized-dds)).

Note that the `SharedCounter` only operates on integer values.

### Why a specialized DDS?

You may be asking yourself, why not just store the shared integer value directly in another DDS like a [SharedMap][]?
Why incur the overhead of another runtime type?

The key to the answer here is that DDSes with simpler merge strategies (like `SharedMap`) take a somewhat brute-force approach to merging concurrent edits.
For a semantic data type like a counter, this can result in undesirable behavior.

#### SharedMap Example

Let's illustrate the issue with an example.

Consider a polling widget.
The widget displays a list of options and allows users to click a checkbox to vote for a given option.
Next to each option in the list, a live counter is displayed that shows the number of votes for that item.

Whenever a user checks an option, all users should see the counter corresponding to that option increment by 1.

In this example, the application is storing its vote counts in a [SharedMap][], where the map keys are `strings` representing the IDs of the options, and the values are `numbers` representing the associated vote counts.

For simplicity, we will look at a scenario in which 2 users vote for the same option at around the same time.

Specifically, **User A** clicks the checkbox for option **Foo**, which currently has **0** votes.
The application then optimistically updates the vote count for that object by writing the updated counter value of **1** for option **Foo** to its `SharedMap`.

The value change operation (op) is then transmitted to the service to be sequenced and eventually sent to other users in the collaborative session.

At around the same time, **User B** clicks the checkbox for option **Foo**, which in their view currently has **0** votes.
Similarly to before, the application optimistically updates the associated counter value to **1**, and transmits its own update op.

The service receives the op from **User A** first, and sequences their op updating **Foo** to **1** as **op 0**. **User B**'s op is received second, and is sequenced as **op 1**.

Both users then receive acknowledgement of their update, and receive **op 0** and **op 1** to be applied in order.
Both clients apply **op 0** by setting **Foo** to **1**.
Then both clients apply **op 1** by setting **Foo** to **1**.

But this isn't right.
Two different users voted for option **Foo**, but the counter now displays **1**.

`SharedCounter` solves this problem by expressing its operations in terms of _increments_ and _decrements_ rather than as direct value updates.

So for the scenario above, if the system was using `SharedCounter`s to represent the vote counts, **User A** would submit an op _incrementing_ **Foo** by **+1**, rather than updating the value of **Foo** from **0** to **1**.
At around the same time, **User B** would submit their own **+1** op for **Foo**.

Assuming the same sequencing, both users first apply **op 0** and increment their counter for **Foo** by **+1** (from **0** to **1**).
Next, they both apply **op 1** and increment their counter for **Foo** by **+1** a second time (from **1** to **2**).

Now both users see the right vote count for `Foo`!

## Usage

The `SharedCounter` object provides a simple API surface for managing a shared integer whose value may be incremented and decremented by collaborators.

A new `SharedCounter` value will be initialized with its value set to `0`.
If you wish to initialize the counter to a different value, you may [modify the value](#incrementing--decrementing-the-value) before attaching the container, or before storing it in another shared object like a `SharedMap`.

## Installation

The package containing the `SharedCounter` library is [@fluidframework/shared-counter](https://www.npmjs.com/package/@fluidframework/counter).

To get started, run the following from a terminal in your repository:

```bash
npm install @fluidframework/shared-counter
```

### Creation

The workflow for creating a `SharedCounter` is effectively the same as many of our other DDSes.
For an example of how to create one, please see our workflow examples for [SharedMap creation][].

### Incrementing / decrementing the value

Once you have created your `SharedCounter`, you can change its value using the [increment][] method.
This method accepts a positive or negative _integer_ to be applied to the shared value.

```javascript
sharedCounter.increment(3); // Adds 3 to the current value
sharedCounter.increment(-5); // Subtracts 5 from the current value
```

### `incremented` event

The [incremented][] event is sent when a client in the collaborative session changes the counter value via the `increment` method.

Signature:

```javascript
(event: "incremented", listener: (incrementAmount: number, newValue: number) => void)
```

By listening to this event, you can receive and apply the changes coming from other collaborators.
Consider the following code example for configuring a Counter widget:

```javascript
const sharedCounter = container.initialObjects.sharedCounter;
let counterValue = sharedCounter.value;

const incrementButton = document.createElement("button");
button.textContent = "Increment";
const decrementButton = document.createElement("button");
button.textContent = "Decrement";

// Increment / decrement shared counter value when the corresponding button is clicked
incrementButton.addEventListener("click", () => sharedCounter.increment(1));
decrementButton.addEventListener("click", () => sharedCounter.increment(-1));

const counterValueLabel = document.createElement("label");
counterValueLabel.textContent = `${counterValue}`;

// This function will be called each time the shared counter value is incremented
// (including increments from this client).
// Update the local counter value and the corresponding label being displayed in the widget.
const updateCounterValueLabel = (delta) => {
	counterValue += delta;
	counterValueLabel.textContent = `${counterValue}`;
};

// Register to be notified when the counter is incremented
sharedCounter.on("incremented", updateCounterValueLabel);
```

In the code above, whenever a user presses either the Increment or Decrement button, the `sharedCounter.increment` is called with +/- 1.
This causes the `incremented` event to be sent to all of the clients who have this container open.

Since `updateCounterValueLabel` is listening for all `incremented` events, the view will always refresh with the appropriate updated value any time a collaborator increments or decrements the counter value.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is no longer supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

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

<!-- Links -->

[increment]: https://fluidframework.com/docs/apis/counter/isharedcounter-interface#increment-methodsignature
[incremented]: https://fluidframework.com/docs/apis/counter/isharedcounterevents-interface#_call_-callsignature
[optimistic dds]: https://fluidframework.com/docs/build/dds/#optimistic-data-structures
[sharedmap]: https://fluidframework.com/docs/data-structures/map
[sharedmap creation]: https://fluidframework.com/docs/data-structures/map/#creation
