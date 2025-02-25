# @fluid-private/stochastic-test-utils

This package contains utilities for writing stochastic tests (sometimes called fuzz tests).
Such tests can be useful for stress testing systems with well-defined inputs and expected invariants.
For example, they are useful for asserting eventual convergence properties of DDSes.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**It is not published, and therefore may only be used in packages within the same pnpm workspace in this repo using the [workspace:*](https://pnpm.io/workspaces#workspace-protocol-workspace) schema.**
**Since this package is not published, it may also only be used as a dev dependency, or as a dependency in packages that are not published.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Model

This package models a stochastic test as a series of serializable _operations_ that are applied to some _initial state_.
The creator of a stochastic test therefore needs to provide:

1. A pure function _generator_ which, given the current state, can produce some operation which should be applied.
2. A _reducer_ which is able to apply an operation to the current state, and produce a new state.
    - If the test writer ops to make the reducer pure (i.e. it does not modify the current state and only produces a new one),
      it is safe for the test author to store historical state objects.
      If the test writer doesn't care, they can instead opt to modify the state object in-place.
      In other words, `performFuzzActions` treats the state of the system as an opaque object.
3. The initial state

As part of providing these objects, the test creator will likely define types for:

1. The shape of their state object
2. The set of operations that may be generated/applied

## Generators

This package defines `Generator` and `AsyncGenerator` types for creation of operations.
It would be possible to instead write this package in terms of built-in javascript generators/async generators.
The downside of using built-in generators is it leads to confusing ownership semantics of the test's state object:
a vanilla javascript generator must produce values without any additional context, and therefore it must capture
the state used to create it at creation time.
However, the "context" for these generators is effectively the global test state object.
As various generators are running, they'll have their state object modified underneath their nose by operation application.
This could lead to some difficult bugs.

On the other hand, the main downside of using custom generator types is that it obstructs usage of yielding control flow,
which is frequently easier to understand.
To alleviate this, this package provides a number of composable helper functions for creating generators.
Test writers generally only need to use these helpers, so this problem is largely encapsulated.

Generally, the composable helper functions come in synchronous and async varieties; use whichever suits your needs.

One useful helper function is `createWeightedGenerator`.
This function can be used naturally to pick from a set of options with provided weights and optional acceptance criteria:

```typescript
const modifyGenerator = ({ random, list }) => {
	return { type: "modify", index: random.integer(0, list.length - 1) };
};
// Produces an infinite stochastic generator which:
// - If both "insert" and "delete" are valid, generates "insert" with 3 times the likelihood as it generates "delete"
// - Produces values from `modifyGenerator` with the same likelihood it produces an "insert"
// - Only allows production of a "delete" operation if the underlying state list is non-empty
const generator = createWeightedGenerator([
	[{ type: "insert" }, 3],
	[modifyGenerator, 3][({ type: "delete" }, 1, (state) => state.list.length > 0)],
]);
```

### Validation

Tests may want to validate invariants at various points.
There are a few suggested ways to do that using this library:

1. Invoke `performFuzzActions` multiple times from within the test, calling whatever validation code is desired in between.
2. Add an explicit "validate" operation, whose application runs whatever validation logic is necessary.
   The `interleave` helper is useful for generating these operations at fixed intervals.

## performFuzzActions

This is the main entrypoint for executing a series of operations.
It also comes with some useful functionality to dump operation contents to a file for debugging purposes.
`performFuzzActions` runs actions until exhausting the input generator.
To limit an infinite generator, use the `take` helper.

## Usage

Some sample usages can be found in the [experimental tree DDS](../../../experimental/dds/tree/src/test/fuzz/SharedTreeFuzzTests.ts).

Consider a more simplistic example: testing a list data structure.
The state object would contain the list itself.
Some basic (clearly not exhaustive) operations might include appending to the list, deleting an element, and modifying an element:

```typescript
interface State extends BaseFuzzTestState {
	list: string[];
}

interface Push {
	type: "push";
	content: string;
}

interface Delete {
	type: "delete";
	index: number;
}

interface Modify {
	type: "modify";
	index: number;
	content: string;
}

type Operation = Push | Delete | Modify;
```

A basic generator for these operations can be created leveraging the helpers:

```typescript
function createListOperationGenerator(): Generator<Operation, State> {
	const pushGenerator = ({ random, list }) => ({ type: "push", content: random.string(4) });

	const deleteGenerator = ({ random, list }) => ({
		type: "delete",
		index: random.pick(0, list.length - 1),
	});

	const modifyGenerator = ({ random, list }) => ({
		type: "modify",
		index: random.pick(0, list.length - 1),
		content: random.string(4),
	});

	return createWeightedGenerator([
		[pushGenerator, 2],
		[deleteGenerator, 1, ({ list }) => list.length > 0],
		[modifyGenerator, 3],
	]);
}
```

Finally, this generator could be used from a test/test helper:

```typescript
describe("list fuzz tests", () => {
	it("doesn't crash on random operations", () => {
		const initialState = makeRandom(0);
		const generator = take(1000, createListOperationGenerator());
		const finalState = performFuzzActions(
			generator,
			{
				push: ({ list }, { content }) => list.push(content),
				delete: ({ list }, { index }) => list.splice(index, 1),
				modify: ({ list }, { index, content }) => {
					list[index] = content;
				},
			},
			initialState,
		);
		doValidation(finalState);
	});
});
```

The `doValidation` step is a bit contrived for this example, but could be useful for other native JS types.
For example, the JS Map spec prescribes that key iteration order is deterministic based on order of insertion.
One could write a fuzz test on map operations which looks much like the above, but part of the "apply" step
would be keeping a side-channel record of the expected iteration order, and the `doValidation` step at the end
would assert that the real order matches the expected one.

## describeFuzz

This package also exports a `describeFuzz` helper, which is a simple wrapper around Mocha's `describe` function.
`describeFuzz` supports injection of test-running policy through the following environment variables:

-   `FUZZ_TEST_COUNT`: Controls the `testCount` value passed to the fuzz test's `describeFuzz` block callback.
-   `FUZZ_STRESS_RUN`: If set to a truthy value, test commands in packages with fuzz tests will only run `describeFuzz` blocks.

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
