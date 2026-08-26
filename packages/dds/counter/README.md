# @fluidframework/counter

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

For a dependency on a Fluid Framework library's public APIs, we recommend a `^` (caret) version range.
For example, use `^1.3.4`.
Fluid Framework libraries can use different version ranges for dependencies on other Fluid Framework libraries.
For dependencies in your application, we recommend a `^` version range.

For a dependency on an unstable API, such as a `beta` API, we recommend a more restrictive version range.
For example, use a `~` version range.

## Installation

Run this command to install the package:

```bash
npm i @fluidframework/counter
```

## Importing from this package

This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.
For information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

Import the `public` ([Semantic Versioning (SemVer)](https://semver.org/)) APIs from `@fluidframework/counter`.

Import the `legacy` APIs from `@fluidframework/counter/legacy`.

## API Documentation

Read the **@fluidframework/counter** API documentation at <https://fluidframework.com/docs/apis/counter>.

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

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

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
