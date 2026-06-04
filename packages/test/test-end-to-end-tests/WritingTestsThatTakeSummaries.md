# Writing Tests That Take Summaries

## Table of Contents

-   [Introduction](#introduction)
-   [Why a dedicated summarizer](#why-a-dedicated-summarizer)
-   [How to configure the regular (interactive) containers](#how-to-configure-the-regular-interactive-containers)
-   [How to configure and create the dedicated summarizer](#how-to-configure-and-create-the-dedicated-summarizer)
-   [How to take a summary and inspect its result](#how-to-take-a-summary-and-inspect-its-result)
    -   [Inspecting the summary result](#inspecting-the-summary-result)
-   [How to load a new container or summarizer from a specific summary](#how-to-load-a-new-container-or-summarizer-from-a-specific-summary)
    -   [Load a new interactive container from a summary](#load-a-new-interactive-container-from-a-summary)
    -   [Load a new summarizer from a summary](#load-a-new-summarizer-from-a-summary)
-   [The rules that keep these tests deterministic](#the-rules-that-keep-these-tests-deterministic)
    -   [1. Use `syncSummarizer: true`](#1-use-syncsummarizer-true)
    -   [2. Disable automatic summaries on every interactive container](#2-disable-automatic-summaries-on-every-interactive-container)
    -   [3. Call `ensureSynchronized()` before every summary](#3-call-ensuresynchronized-before-every-summary)
    -   [4. Use `summaryVersion` to chain loads](#4-use-summaryversion-to-chain-loads)
    -   [5. Close one summarizer before starting another](#5-close-one-summarizer-before-starting-another)
-   [A complete minimal example](#a-complete-minimal-example)
-   [Reference: key imports](#reference-key-imports)

## Introduction

This document explains the pattern for writing end-to-end (e2e) tests that generate **summaries**. The canonical examples live under [`src/test/summarization/`](./src/test/summarization/).

## Why a dedicated summarizer

In production, summaries are produced by a single elected **summarizer client** - a non-interactive container that the runtime spins up in the background and generates summaries based on heuristics. In a test you want to control _exactly when_ a summary happens and _what_ goes into it, so you:

1. Create your normal interactive container(s) with the runtime's automatic summarizer **disabled**, so nothing summarizes behind your back.
2. Create a separate **summarizer container** that summarizes only when you call `summarizeNow` on it.
3. Synchronize all clients before each summary so the summary is deterministic.

This separation is the heart of the pattern. Everything below follows from it.

## How to configure the regular (interactive) containers

Every interactive container the test creates or loads must have the runtime's automatic summarizer turned **off**. Otherwise a background summary can race your `summarizeNow` calls and your assertions, making the test flaky.

Disable it via `summaryConfigOverrides: { state: "disabled" }` in the container config:

```ts
const testContainerConfig: ITestContainerConfig = {
	...
	runtimeOptions: {
		...
		// The piece that matters for summarization: turn off the automatic summarizer.
		summaryOptions: {
			summaryConfigOverrides: { state: "disabled" },
		},
	},
};
```

Use this config for **every** interactive container — both the one you create and any you later load from a summary (`provider.makeTestContainer(testContainerConfig)` / `provider.loadTestContainer(testContainerConfig, ...)`).

## How to configure and create the dedicated summarizer

The summarizer must _not_ inherit the `state: "disabled"` override from the interactive container's config; it needs to be able to summarize when asked. The simplest form lets `createSummarizer` apply a sensible default summary config for you (`state: "disableHeuristics"`, etc.):

```ts
const { summarizer } = await createSummarizer(provider, container);
```

If your test creates a custom `testContainerConfig` for interactive containers, the summarizer should resuse it otherwise config mimatch can lead to issues. It should however **supply a `disableHeuristics` summary config** or **clear its summary override**:

```ts
const summarizerContainerConfig: ITestContainerConfig = {
	...testContainerConfig,
	runtimeOptions: {
		...testContainerConfig.runtimeOptions,
		// Either supply a `disableHeuristics` config so the summarizer only summarizes on demand...
		summaryOptions: { summaryConfigOverrides: { state: "disableHeuristics" } },
		// ...or clear the override entirely and let createSummarizer apply its default config:
		// summaryOptions: undefined,
	},
};
```

Either way, the rule is the same: the summarizer must not carry `state: "disabled"`.

`createSummarizer(provider, container, config?, summaryVersion?, logger?)` returns `{ container, summarizer }`.
The `summarizer` is the `ISummarizer` you call `summarizeNow` on and the returned `container` is the summarizer's own container (useful for reconnect/election below).

> If your data store needs a custom registry/factory, use `createSummarizerFromFactory` instead - it takes the data store factory and (optionally) a container-runtime factory directly. See its uses in [`summaries.spec.ts`](./src/test/summarization/summaries.spec.ts).

## How to take a summary and inspect its result

Use the `summarizeNow` helper from `@fluidframework/test-utils/internal`. It drives the full submit → broadcast → ack/nack handshake, throws on failure, and returns a `SummaryInfo`:

```ts
interface SummaryInfo {
	summaryTree: ISummaryTree; // the generated summary tree — inspect it for handles/blobs
	summaryVersion: string;    // the acked summary handle — use this to load from this summary
	summaryRefSeq: number;     // reference sequence number of this summary
}
```

The minimal round looks like this:

```ts
// 1. Make whatever changes you want captured.
dataObject.root.set("key", "value");

// 2. Make sure every client has seen those ops before summarizing.
await provider.ensureSynchronized();

// 3. Summarize. summarizeNow throws if the summary fails.
const { summaryTree, summaryVersion } = await summarizeNow(summarizer);
```

> You can call `summarizeOnDemand` on the `ISummarizer` directly and manage the submit, broadcast, ack / nack results independently.

### Inspecting the summary result

The result of the `summarizeNow` (or `summarizeOnDemand`) contains the generated summary tree (`ISummaryTree`).
Tests can inspect the summary tree if needed. However, it should be careful to not rely on the summary tree structure as that can change.

If you only care that summarizing succeeds, assert against the promise directly:

```ts
await assert.doesNotReject(summarizeNow(summarizer), "Summary should succeed");
```

## How to load a new container or summarizer from a specific summary

`summaryVersion` is the key that ties everything together: pass it when loading to force a client to start from _that exact_ summary rather than the latest.

### Load a new interactive container from a summary

Pass the version through `LoaderHeader.version` to `loadTestContainer`:

```ts
const loaded = await provider.loadTestContainer(testContainerConfig, {
	[LoaderHeader.version]: summaryVersion,
});
```

This is how you validate that a summary round-trips: load a fresh container from the summary you just took and assert its state matches the source container.

### Load a new summarizer from a summary

Pass `summaryVersion` as the 4th argument to `createSummarizer`:

```ts
const { summarizer: summarizer2 } = await createSummarizer(
	provider,
	mainContainer,
	undefined /* config */,
	summaryVersion,
);
```

A summarizer started from a given summary will produce its next summary incrementally on top of it.

## The rules that keep these tests deterministic

These are the things that, if skipped, make summarization tests flaky or wrong. Treat them as a checklist.

### 1. Use `syncSummarizer: true`

Get the provider with `getTestObjectProvider({ syncSummarizer: true })`. This ensures that when you call `provider.ensureSynchronized()`, the summarizer is also brought up to the latest state along with the other clients. Without it, `ensureSynchronized` does not wait for the summarizer, so a subsequent `summarizeNow` may run before the summarizer has processed your latest ops.

```ts
beforeEach("getTestObjectProvider", async function () {
	provider = getTestObjectProvider({ syncSummarizer: true });
});
```

### 2. Disable automatic summaries on every interactive container

As covered above — `summaryConfigOverrides: { state: "disabled" }`. If a regular container is allowed to summarize, a background summary can land between your changes and your `summarizeNow`, and your assertions about what's in the summary become non-deterministic.

### 3. Call `ensureSynchronized()` before every summary

```ts
await provider.ensureSynchronized();
await summarizeNow(summarizer);
```

`summarizeNow` summarizes whatever the summarizer has processed _so far_. If you don't synchronize first, ops you just sent may not have reached the summarizer yet, and they'll silently be excluded from the summary. Always synchronize first.

### 4. Use `summaryVersion` to chain loads

When you load a container or summarizer to validate a summary, load it from that summary's `summaryVersion` (see above) — don't rely on "latest". On real services the latest summary may differ from the one you intend to test (or may have been replaced), so be explicit.

### 5. Close one summarizer before starting another

Two live summarizers fight over election and can interfere with each other. When you're done with a summarizer and want a fresh one (e.g. to load from a newer summary), **close the old one first**:

```ts
summarizer.close();
const { summarizer: summarizer2 } = await createSummarizer(
	provider,
	mainContainer,
	undefined,
	summaryVersion,
);
await summarizeNow(summarizer2);
```

## A complete minimal example

Putting it together — create, summarize, load-and-validate, then summarize from a new summarizer:

```ts
describeCompat("My summarization test", "NoCompat", (getTestObjectProvider) => {
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("round-trips a change through a summary", async () => {
		// 1. Create an interactive container with auto-summaries disabled.
		const container = await provider.makeTestContainer(testContainerConfig);
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		await waitForContainerConnection(container);

		// 2. Create a dedicated summarizer.
		const { summarizer } = await createSummarizer(provider, container);

		// 3. Make a change, synchronize, summarize.
		dataObject.root.set("key", "value");
		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);

		// 4. Load a fresh container from that exact summary and validate.
		const loaded = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const loadedObject = await getContainerEntryPointBackCompat<ITestFluidObject>(loaded);
		assert.strictEqual(loadedObject.root.get("key"), "value");

		// 5. Hand off to a new summarizer loaded from that summary.
		summarizer.close();
		const { summarizer: summarizer2 } = await createSummarizer(
			provider,
			container,
			undefined,
			summaryVersion,
		);
		await assert.doesNotReject(summarizeNow(summarizer2));
	});
});
```

## Reference: key imports

All from `@fluidframework/test-utils/internal` unless noted:

| Symbol | Purpose |
|---|---|
| `createSummarizer(provider, container, config?, summaryVersion?, logger?)` | Create a dedicated summarizer; returns `{ container, summarizer }`. |
| `createSummarizerFromFactory(...)` | Same, when you need a custom data store / container-runtime factory. |
| `summarizeNow(summarizer, reason?)` | Take an on-demand summary; returns `SummaryInfo`; throws on failure. |
| `SummaryInfo` | `{ summaryTree, summaryVersion, summaryRefSeq }`. |
| `ITestContainerConfig` | Container config — set `runtimeOptions.summaryOptions` here. |
| `LoaderHeader.version` (from `@fluidframework/container-definitions/internal`) | Header to load a container from a specific summary. |
| `ISummarizer` (from `@fluidframework/container-runtime/internal`) | The summarizer handle; `summarizer.close()` to release it. |
| `provider.ensureSynchronized()` | Flush ops to all clients before summarizing. |
| `getTestObjectProvider({ syncSummarizer: true })` | Provider configured for deterministic summaries. |
