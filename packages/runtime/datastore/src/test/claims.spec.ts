/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import type { IErrorBase, IFluidHandle } from "@fluidframework/core-interfaces";
import { fluidHandleSymbol } from "@fluidframework/core-interfaces";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import type {
	IRuntimeMessageCollection,
	IRuntimeStorageService,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import {
	FluidHandleBase,
	encodeHandleForSerialization,
	toFluidHandleErased,
} from "@fluidframework/runtime-utils/internal";
import { MockFluidDataStoreContext } from "@fluidframework/test-runtime-utils/internal";

import {
	DataStoreMessageType,
	FluidDataStoreRuntime,
	type IClaimMessage,
	type ISharedObjectRegistry,
	type LocalFluidDataStoreRuntimeMessage,
} from "../dataStoreRuntime.js";

const claimsBlobName = ".claims";

interface SubmittedOp {
	type: string;
	content: unknown;
}

class TestStorage implements IRuntimeStorageService {
	public constructor(private readonly blobs: Map<string, ArrayBufferLike>) {}
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const b = this.blobs.get(id);
		if (b === undefined) {
			throw new Error(`Blob ${id} not found`);
		}
		return b;
	}
}

/**
 * Minimal IFluidHandle stub usable in a claim value. It is "attached" so
 * binding it is a no-op.
 */
class FakeHandle extends FluidHandleBase<unknown> implements IFluidHandleInternal {
	public readonly isAttached = true;
	public constructor(public readonly absolutePath: string) {
		super();
	}
	public attachGraph(): void {
		/* no-op */
	}
	public async get(): Promise<unknown> {
		return undefined;
	}
	public get [fluidHandleSymbol](): never {
		return toFluidHandleErased(this) as unknown as never;
	}
}

function makeContext(options?: {
	attachState?: AttachState;
	baseSnapshot?: ISnapshotTree;
	blobs?: Map<string, ArrayBufferLike>;
}): {
	context: MockFluidDataStoreContext;
	submitted: SubmittedOp[];
} {
	const ctx = new MockFluidDataStoreContext();
	ctx.attachState = options?.attachState ?? AttachState.Attached;
	ctx.baseSnapshot = options?.baseSnapshot;
	ctx.storage = new TestStorage(options?.blobs ?? new Map<string, ArrayBufferLike>());
	const submitted: SubmittedOp[] = [];
	(ctx as unknown as { submitMessage: (t: string, c: unknown) => void }).submitMessage = (
		type,
		content,
	) => {
		submitted.push({ type, content });
	};
	(ctx as unknown as { makeLocallyVisible: () => void }).makeLocallyVisible = () => {};
	return { context: ctx, submitted };
}

/**
 * Yield enough microtasks for trySetClaim's async ensureClaimsLoaded /
 * promise chain to submit its op.
 */
async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

const sharedObjectRegistry: ISharedObjectRegistry = {
	get: () => undefined,
};

function createRuntime(
	context: MockFluidDataStoreContext,
	policies?: { enableDataStoreClaims?: boolean },
): FluidDataStoreRuntime {
	const effectivePolicies = policies ?? { enableDataStoreClaims: true };
	const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
		context,
		sharedObjectRegistry,
		/* existing */ context.baseSnapshot !== undefined,
		async () => runtime,
		effectivePolicies,
	);
	return runtime;
}

function makeClaimAck(content: IClaimMessage, local: boolean): IRuntimeMessageCollection {
	const envelope = {
		type: DataStoreMessageType.Claim,
	} as unknown as ISequencedMessageEnvelope;
	return {
		envelope,
		local,
		messagesContent: [{ contents: content, clientSequenceNumber: 1, localOpMetadata: {} }],
	};
}

/**
 * Pull the most-recently-submitted claim op off the submitted list.
 */
async function popClaim(submitted: SubmittedOp[]): Promise<IClaimMessage> {
	await flush();
	const op = submitted.pop();
	assert(op !== undefined, "Expected a submitted claim op");
	assert.strictEqual(op.type, DataStoreMessageType.Claim, "Expected Claim op type");
	return op.content as IClaimMessage;
}

describe("FluidDataStoreRuntime claims", () => {
	it("single-client claim resolves to Success and is exposed via getClaim/hasClaim/claims", async () => {
		const { context, submitted } = makeContext();
		const runtime = createRuntime(context);

		const promise = runtime.trySetClaim?.("k", "v");
		assert(promise !== undefined);
		// The op was submitted; round-trip it back as a local ack.
		const claim = await popClaim(submitted);
		runtime.processMessages(makeClaimAck(claim, true));
		assert.strictEqual(await promise, "Success");
		assert.strictEqual(runtime.hasClaim?.("k"), true);
		assert.strictEqual(runtime.getClaim?.("k"), "v");
		assert.deepStrictEqual([...(runtime.claims?.entries() ?? [])], [["k", "v"]]);
	});

	it("two-client race: first writer wins; loser observes AlreadyClaimed", async () => {
		// Client A
		const { context: ctxA, submitted: subA } = makeContext();
		const runtimeA = createRuntime(ctxA);
		// Client B
		const { context: ctxB, submitted: subB } = makeContext();
		const runtimeB = createRuntime(ctxB);

		const pA = runtimeA.trySetClaim?.("k", "A");
		const pB = runtimeB.trySetClaim?.("k", "B");
		assert(pA !== undefined && pB !== undefined);

		const aOp = await popClaim(subA);
		const bOp = await popClaim(subB);

		// Sequencer orders A then B; both clients see both ops. A is local on
		// runtimeA, remote on runtimeB; B is local on runtimeB, remote on runtimeA.
		runtimeA.processMessages(makeClaimAck(aOp, true));
		runtimeA.processMessages(makeClaimAck(bOp, false));
		runtimeB.processMessages(makeClaimAck(aOp, false));
		runtimeB.processMessages(makeClaimAck(bOp, true));

		assert.strictEqual(await pA, "Success");
		assert.strictEqual(await pB, "AlreadyClaimed");
		assert.strictEqual(runtimeA.getClaim?.("k"), "A");
		assert.strictEqual(runtimeB.getClaim?.("k"), "A");
	});

	it("repeated claim from the winner returns Success even with a different value", async () => {
		const { context, submitted } = makeContext();
		const runtime = createRuntime(context);

		const p1 = runtime.trySetClaim?.("k", "v1");
		const op1 = await popClaim(submitted);
		runtime.processMessages(makeClaimAck(op1, true));
		assert.strictEqual(await p1, "Success");

		// Repeat with different value -> still Success, original value retained.
		const p2 = runtime.trySetClaim?.("k", "v2");
		assert.strictEqual(await p2, "Success");
		assert.strictEqual(runtime.getClaim?.("k"), "v1");
	});

	it("repeated claim from a loser returns AlreadyClaimed (identity, not value)", async () => {
		const { context: ctxA, submitted: subA } = makeContext();
		const runtimeA = createRuntime(ctxA);
		const { context: ctxB, submitted: subB } = makeContext();
		const runtimeB = createRuntime(ctxB);

		const pA = runtimeA.trySetClaim?.("k", "shared");
		const pB = runtimeB.trySetClaim?.("k", "shared");
		const aOp = await popClaim(subA);
		const bOp = await popClaim(subB);
		runtimeA.processMessages(makeClaimAck(aOp, true));
		runtimeA.processMessages(makeClaimAck(bOp, false));
		runtimeB.processMessages(makeClaimAck(aOp, false));
		runtimeB.processMessages(makeClaimAck(bOp, true));
		assert.strictEqual(await pA, "Success");
		assert.strictEqual(await pB, "AlreadyClaimed");

		// Loser tries again with the same (key, value): still AlreadyClaimed.
		assert.strictEqual(await runtimeB.trySetClaim?.("k", "shared"), "AlreadyClaimed");
	});

	it("detached set resolves Success synchronously and is persisted via getAttachSummary", async () => {
		const { context } = makeContext({ attachState: AttachState.Detached });
		const runtime = createRuntime(context);
		assert.strictEqual(await runtime.trySetClaim?.("k", "v"), "Success");
		assert.strictEqual(runtime.hasClaim?.("k"), true);

		// Make the runtime locally visible so getAttachSummary works.
		runtime.makeVisibleAndAttachGraph();
		const attachSummary = runtime.getAttachSummary();
		const claimsBlob = attachSummary.summary.tree[claimsBlobName];
		assert(claimsBlob !== undefined, "Attach summary must include .claims blob");
		assert.strictEqual(claimsBlob.type, SummaryType.Blob);
	});

	it("after detached set + attach, a remote op for the same key resolves AlreadyClaimed", async () => {
		const { context, submitted } = makeContext({ attachState: AttachState.Detached });
		const runtime = createRuntime(context);
		assert.strictEqual(await runtime.trySetClaim?.("k", "winner"), "Success");

		// Simulate becoming attached.
		runtime.setAttachState(AttachState.Attaching);
		runtime.setAttachState(AttachState.Attached);

		// Now a remote claim for the same key arrives -> ignored.
		const remoteOp: IClaimMessage = { key: "k", value: "loser" };
		runtime.processMessages(makeClaimAck(remoteOp, false));
		assert.strictEqual(runtime.getClaim?.("k"), "winner");
		assert.strictEqual(submitted.length, 0, "Detached set should not have submitted an op");
	});

	it("GC data includes outbound routes from handles inside claim values", async () => {
		const { context, submitted } = makeContext();
		const runtime = createRuntime(context);
		const handle = new FakeHandle("/dataStoreA/channelB") as unknown as IFluidHandle;
		const p = runtime.trySetClaim?.("k", { foo: handle });
		const op = await popClaim(submitted);
		runtime.processMessages(makeClaimAck(op, true));
		assert.strictEqual(await p, "Success");
		const gcData = await runtime.getGCData();
		assert(gcData.gcNodes["/"] !== undefined);
		assert(
			gcData.gcNodes["/"].includes("/dataStoreA/channelB"),
			`Expected outbound route from claim handle, got ${JSON.stringify(gcData.gcNodes["/"])}`,
		);
	});

	it("reconnect: a pending claim that loses the race resolves to AlreadyClaimed", async () => {
		const { context, submitted } = makeContext();
		const runtime = createRuntime(context);

		// Start a claim attempt locally.
		const pLocal = runtime.trySetClaim?.("k", "local");
		const localOp = await popClaim(submitted);

		// A remote winner is sequenced first.
		runtime.processMessages(makeClaimAck({ key: "k", value: "remote" }, false));

		// Resubmit the local op (e.g. reconnect). The op processor sees the
		// key is already claimed and resolves the pending deferred to
		// AlreadyClaimed.
		runtime.reSubmit(
			DataStoreMessageType.Claim,
			localOp as unknown as Record<string, unknown>,
			undefined,
			false,
		);
		// The resubmit emits the same op back through submit; pop it and ack as local.
		const resubmitted = await popClaim(submitted);
		runtime.processMessages(makeClaimAck(resubmitted, true));

		assert.strictEqual(await pLocal, "AlreadyClaimed");
		assert.strictEqual(runtime.getClaim?.("k"), "remote");
	});

	it("feature flag off: trySetClaim throws a UsageError", async () => {
		const { context } = makeContext();
		const runtime = createRuntime(context, { enableDataStoreClaims: false });
		await assert.rejects(
			async () => runtime.trySetClaim?.("k", "v"),
			(e: IErrorBase) =>
				e.errorType === ContainerErrorTypes.usageError &&
				e.message.includes("DataStore claims are not enabled"),
		);
	});

	it("rehydrates sequencedClaims from a base snapshot blob", async () => {
		// Build a snapshot containing the .claims blob.
		const blobId = "claimsBlobId";
		const blobContent = JSON.stringify({
			entries: [
				["a", "valueA"],
				[
					"b",
					encodeHandleForSerialization(
						new FakeHandle("/x/y") as unknown as IFluidHandleInternal,
					),
				],
			],
		});
		const blobs = new Map<string, ArrayBufferLike>();
		blobs.set(blobId, stringToBuffer(blobContent, "utf8"));
		const baseSnapshot: ISnapshotTree = {
			blobs: { [claimsBlobName]: blobId },
			trees: {},
		};
		const { context } = makeContext({ baseSnapshot, blobs });
		const runtime = createRuntime(context);

		// Force the load to complete by awaiting trySetClaim (which awaits the load).
		// (Using a key that doesn't exist; we expect the op to be submitted, but we
		//  don't process it — we just want the load to drain.)
		const setP = runtime.trySetClaim?.("c", "valueC");
		// Allow microtasks to run.
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(runtime.hasClaim?.("a"), true);
		assert.strictEqual(runtime.getClaim?.("a"), "valueA");
		assert.strictEqual(runtime.hasClaim?.("b"), true);
		const decoded = runtime.getClaim?.("b") as { absolutePath: string };
		assert.strictEqual(decoded.absolutePath, "/x/y");

		// Don't leave the open setP unhandled - just await it later. We attach
		// a no-op handler so any rejection is observed.
		setP?.catch(() => undefined);
	});

	it("staging mode: trySetClaim throws", async () => {
		const { context } = makeContext();
		(context.containerRuntime as unknown as { inStagingMode: boolean }).inStagingMode = true;
		const runtime = createRuntime(context);
		await assert.rejects(
			async () => runtime.trySetClaim?.("k", "v"),
			(e: IErrorBase) =>
				e.errorType === ContainerErrorTypes.usageError && e.message.includes("staging"),
		);
	});

	it("summary includes the .claims blob with sequenced entries", async () => {
		const { context, submitted } = makeContext();
		const runtime = createRuntime(context);
		const p = runtime.trySetClaim?.("k", "v");
		runtime.processMessages(makeClaimAck(await popClaim(submitted), true));
		await p;

		const summary = await runtime.summarize(true, false);
		assert(summary.summary.type === SummaryType.Tree);
		const blob = summary.summary.tree[claimsBlobName];
		assert(blob?.type === SummaryType.Blob);
		const parsed = JSON.parse(
			typeof blob.content === "string"
				? blob.content
				: Buffer.from(blob.content).toString("utf8"),
		) as { entries: [string, unknown][] };
		assert.deepStrictEqual(parsed.entries, [["k", "v"]]);
	});

	it("dispose resolves outstanding pending claims as AlreadyClaimed", async () => {
		const { context } = makeContext();
		const runtime = createRuntime(context);
		const p = runtime.trySetClaim?.("k", "v");
		await flush();
		runtime.dispose();
		assert.strictEqual(await p, "AlreadyClaimed");
	});

	// Reference imported types so they aren't flagged as unused.
	const _typeRefs: LocalFluidDataStoreRuntimeMessage[] = [];
	if (_typeRefs.length > 0) {
		throw new Error("unreachable");
	}
});
