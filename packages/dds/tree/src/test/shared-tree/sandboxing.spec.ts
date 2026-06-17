/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import { assert } from "@fluidframework/core-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion, type ICodecOptions } from "../../codec/index.js";
import {
	findCommonAncestor,
	type ChangeMetadata,
	type GraphCommit,
	type RevisionTag,
} from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	independentInitializedView,
	TreeAlpha,
	type ForestOptions,
	type TreeCheckout,
	type ViewContent,
} from "../../shared-tree/index.js";
import {
	extractPersistedSchema,
	type TreeViewAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/api/index.js";
import {
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type UnsafeUnknownSchema,
} from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { TestTreeProviderLite, StringArray } from "../utils.js";

/**
 * Gets the head commit of a view.
 * Used for debugging and logging purposes only.
 */
function headFromView<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	view: TreeViewAlpha<TSchema>,
): GraphCommit<unknown> {
	return (
		view as unknown as { readonly checkout: TreeCheckout }
	).checkout.mainBranch.getHead();
}

/**
 * Gets the revisions of the commits that are in the `ahead` view but not in the `behind` view.
 * Note that the returned list includes commits that are in both views but have a different base.
 * Used for debugging and logging purposes only.
 */
function getMissingCommits<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	behind: TreeViewAlpha<TSchema>,
	ahead: TreeViewAlpha<TSchema>,
): string {
	const behindHead = headFromView(behind);
	const aheadHead = headFromView(ahead);
	const targetPath: GraphCommit<unknown>[] = [];
	const ancestor = findCommonAncestor(behindHead, [aheadHead, targetPath]);
	assert(ancestor !== undefined, "Branches do not share a common ancestor.");
	return `[${targetPath.map((commit) => commit.revision).join(", ")}]`;
}

/**
 * Gets the revision of a change.
 * Used for debugging and logging purposes only.
 */
function getRevision(newChange: JsonCompatibleReadOnly) {
	return (newChange as unknown as { revision: RevisionTag }).revision;
}

interface PromiseWithResolver {
	readonly promise: Promise<void>;
	readonly resolver: () => void;
}

/**
 * Creates a promise and a resolver for the promise.
 */
function makePromiseWithResolver(): PromiseWithResolver {
	let resolver: undefined | (() => void);
	const promise = new Promise<void>((resolve) => {
		resolver = resolve;
	});
	assert(resolver !== undefined, "Resolver should have been assigned");
	return { promise, resolver };
}

class Host<const TSchema extends ImplicitFieldSchema> {
	/** The main branch on the host. Is automatically updated when peer changes are received. */
	public readonly main: TreeViewAlpha<TSchema>;
	/** The local branch on the host. Always reflects the state of the sandbox (though lags behind it due to async) */
	public readonly local: TreeViewAlpha<TSchema>;
	/**
	 * The promise and resolver for the process of updating the sandbox with inbound changes.
	 * When defined, the sandbox is behind the host's main branch. The promise resolves when the sandbox has caught up with the host's main branch.
	 * When undefined, no update is in progress and the sandbox is up-to-date with the host's main branch.
	 */
	private updateInProgress?: PromiseWithResolver;
	/**
	 * Clone of main branch from when the last update to the sandbox was initiated.
	 */
	private mainHeadFromLastUpdate?: TreeViewAlpha<TSchema>;

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The callback to send updates from the host to the sandbox so that it learns about inbound changes. */
		private readonly sendUpdateToSandbox: (change: JsonCompatibleReadOnly) => void,
		/** The callback to acknowledge outbound changes from the sandbox. */
		private readonly ackOutboundChangeFromSandbox: () => void,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.main = main;
		this.local = main.fork();

		this.main.events.on("changed", (metadata: ChangeMetadata) => {
			if (!metadata.isLocal) {
				this.syncSandboxToInboundChanges();
			}
		});
	}

	/**
	 * Must be called when the sandbox sends an outbound change to the host.
	 * The change is guaranteed to be applied to the host's main branch.
	 */
	public receiveOutboundChange(change: JsonCompatibleReadOnly): void {
		this.logger(`Host: received outbound change [${getRevision(change)}] from sandbox`);
		if (this.mainHeadFromLastUpdate !== undefined) {
			this.logger(
				`Host: abandoning update in progress for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
			);
			this.mainHeadFromLastUpdate.dispose();
			this.mainHeadFromLastUpdate = undefined;
		}
		this.local.applyChange(change);
		this.logger(
			`Host: merging outbound changes from sandbox: ${getMissingCommits(this.main, this.local)}`,
		);
		this.main.merge(this.local, false);
		this.ackOutboundChangeFromSandbox();
		this.syncSandboxToInboundChanges();
	}

	private syncSandboxToInboundChanges(): void {
		if (this.local.hasNewEdits(this.main)) {
			this.logger(
				`Host: detected new inbound changes that need to be reflected in sandbox ${getMissingCommits(this.local, this.main)}`,
			);
			if (this.mainHeadFromLastUpdate !== undefined) {
				this.logger("Host: update already in progress. Will wait for it to complete or fail.");
				return;
			}
			if (this.updateInProgress === undefined) {
				this.logger("Host: no pre-existing update in progress. Creating new update promise.");
				this.updateInProgress = makePromiseWithResolver();
			} else {
				this.logger("Host: Reusing existing update promise.");
			}
			this.mainHeadFromLastUpdate = this.main.fork();
			const update = this.local.computeNetChangeIfRebasedOnto(this.mainHeadFromLastUpdate);
			this.logger("Host: sending update to sandbox");
			this.sendUpdateToSandbox(update);
		} else {
			this.logger("Host: no new inbound changes that need to be reflected in sandbox");
			// The sandbox is now caught up with the host's main branch
			if (this.updateInProgress !== undefined) {
				this.logger("Host: resolving update promise");
				const resolver = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolver();
			}
		}
	}

	/**
	 * Must be called when the sandbox acknowledges an update that the host has sent.
	 */
	public receiveAckOfUpdate(): void {
		assert(this.updateInProgress !== undefined, "Expected update to be in progress");
		assert(
			this.mainHeadFromLastUpdate !== undefined,
			"Expected main head from last update to be defined",
		);
		this.logger(
			`Host: received ack of update from sandbox for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
		);
		// Reflect the acknowledged update on the local branch
		this.local.rebaseOnto(this.mainHeadFromLastUpdate);
		this.mainHeadFromLastUpdate.dispose();
		this.mainHeadFromLastUpdate = undefined;
		// New changes could have come in since the update was sent,
		// so we try to sync again to ensure the sandbox is fully up-to-date.
		this.syncSandboxToInboundChanges();
	}

	/**
	 * Returns a promise that resolves when all inbound changes have been reflected in the sandbox,
	 * or undefined if all inbound changes have already been reflected on the sandbox.
	 *
	 * If new inbound changes are received while a promise is already in progress,
	 * the existing promise will only resolve once all inbound changes (including the new ones) have been reflected in the sandbox.
	 * This means that there's no need to call this function again after receiving new inbound changes if the previous promise is still pending.
	 */
	public get updatePromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}
}

class Sandbox<const TSchema extends ImplicitFieldSchema> {
	/** The independent view on the sandbox. */
	public readonly view: TreeViewAlpha<TSchema>;
	/** The number of local changes that have been made in the sandbox but not yet reflected on the host. */
	private inFlight: number = 0;
	private pushInProgress?: PromiseWithResolver;

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		/** The callback to send outbound changes from the sandbox to the host. */
		sendOutboundChange: (change: JsonCompatibleReadOnly) => void,
		/** The callback to send acknowledgements of inbound updates from the sandbox to the host. */
		private readonly sendAckOfInboundUpdate: () => void,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.view = independentInitializedView(config, options, content);
		this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal) {
				const newChange = metadata.getChange();
				this.logger(
					`Sand: new outbound change [${getRevision(newChange)}] (inFlight:${this.inFlight}->${this.inFlight + 1})`,
				);
				if (this.pushInProgress === undefined) {
					this.logger("Sand: no pre-existing push in progress. Creating new push promise.");
					this.pushInProgress = makePromiseWithResolver();
				} else {
					this.logger("Sand: Reusing existing push promise.");
				}
				this.inFlight += 1;
				sendOutboundChange(newChange);
			}
		});
	}

	/**
	 * Attempts to apply an update to reflect inbound changes.
	 * The update is ignored if there are local changes that have not yet been reflected on the host.
	 * The `sendAckOfInboundUpdate` callback will be invoked iff the update is applied.
	 * @param update - The update to apply.
	 */
	public receiveInboundUpdate(update: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			// There are local changes that have not yet been reflected on the host,
			// so this inbound update is not applicable to the current state of the sandbox.
			// We ignore the update (another will come once the host has caught up to the sandbox).
			this.logger(`Sand: ignoring update from host (inFlight=${this.inFlight})`);
			return;
		}
		this.view.applyChange(update, false);
		this.logger("Sand: applied update from host");
		this.sendAckOfInboundUpdate();
	}

	/**
	 * Must be called when the host acknowledges a new local change.
	 */
	public receiveAckOfOutboundChange(): void {
		assert(this.inFlight > 0, "Unexpectedly received ack of outbound change");
		this.logger(`Sand: local change acked (inFlight:${this.inFlight}->${this.inFlight - 1})`);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			// The host has now caught up with all local changes
			assert(
				this.pushInProgress !== undefined,
				"Missing push promise despite in-flight changes",
			);
			const resolver = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			this.logger(`Sand: all outbound changes acked. Resolving push promise.`);
			resolver();
		}
	}

	/**
	 * Returns a promise that resolves when all local changes have been reflected on the host, or undefined if there are no local changes in flight.
	 *
	 * If new local changes are made while a promise is already in progress,
	 * the existing promise will only resolve once all local changes (including the new ones) have been reflected on the host.
	 * This means that there's no need to call this function again after making new local changes if the previous promise is still pending.
	 */
	public get pushPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}
}

describe("Host and Sandbox Demo", () => {
	function setup(initialState: string[]) {
		const logger = (message: string) => {
			console.log(message);
		};
		const provider = new TestTreeProviderLite(
			2,
			configuredSharedTree({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: FluidClientVersion.v2_80,
			}).getFactory(),
		);
		const config = new TreeViewConfiguration({
			schema: StringArray,
			enableSchemaValidation: true,
		});

		const peer = asAlpha(provider.trees[0].viewWith(config));
		peer.initialize(initialState);
		provider.synchronizeMessages();

		const main = asAlpha(provider.trees[1].viewWith(config));
		// eslint-disable-next-line prefer-const -- it is assigned below
		let sandbox: Sandbox<typeof StringArray>;

		function sendInboundUpdateFromHostToSandbox(update: JsonCompatibleReadOnly): void {
			setTimeout(() => sandbox.receiveInboundUpdate(update));
		}

		const host = new Host(
			main,
			sendInboundUpdateFromHostToSandbox,
			sendAckOfOutboundChangeFromHostToSandbox,
			logger,
		);

		const hostCompressor = provider.getCompressor(provider.trees[1]);
		const startingState = TreeAlpha.exportCompressed(host.local.root, {
			// TODO: shard the compressor here?
			idCompressor: hostCompressor,
			minVersionForCollab: FluidClientVersion.v2_80,
		});

		function sendOutboundChangeFromSandboxToHostLocalBranch(
			change: JsonCompatibleReadOnly,
		): void {
			setTimeout(() => host.receiveOutboundChange(change));
		}

		function sendAckOfOutboundChangeFromHostToSandbox(): void {
			setTimeout(() => sandbox.receiveAckOfOutboundChange());
		}

		function sendAckOfInboundUpdateFromSandboxToHost(): void {
			setTimeout(() => host.receiveAckOfUpdate());
		}

		sandbox = new Sandbox(
			config,
			{ jsonValidator: FormatValidatorBasic },
			{
				tree: startingState,
				schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
				// TODO: shard the compressor here?
				idCompressor: hostCompressor,
			},
			sendOutboundChangeFromSandboxToHostLocalBranch,
			sendAckOfInboundUpdateFromSandboxToHost,
			logger,
		);

		return { peer, host, sandbox, provider };
	}

	it("the initial state is consistent across the host and sandbox", async () => {
		const { host, sandbox } = setup(["A"]);
		strict.deepEqual([...sandbox.view.root], ["A"]);
		strict.deepEqual([...host.local.root], ["A"]);
		strict.deepEqual([...host.main.root], ["A"]);
	});

	it("one outbound edit", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit in the sandbox
		sandbox.view.root.push("B(s)");
		// The edit is synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)"]);
		// The edit is not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The sandbox should have started the process of pushing the edit to the host
		const pushPromise = sandbox.pushPromise ?? strict.fail("Expected push to be in progress");
		// Wait for the edit to be pushed to the host
		await pushPromise;

		// The edit is now reflected in the host
		strict.deepEqual([...host.local.root], ["B(s)"]);
		strict.deepEqual([...host.main.root], ["B(s)"]);
		// The edit is not reflected in the peer yet
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();

		// The edit is now reflected in the peer
		strict.deepEqual([...peer.root], ["B(s)"]);
	});

	it("new outbound edits during outbound edit push", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit in the sandbox
		sandbox.view.root.push("B(s)");
		// The edit is synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)"]);
		// The edit is not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The sandbox should have started the process of pushing the edit to the host
		const pushPromise = sandbox.pushPromise ?? strict.fail("Expected push to be in progress");

		// Before the push completes, other edits are made in the sandbox
		sandbox.view.root.push("C(s)");
		sandbox.view.root.push("D(s)");

		// The new edits are synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)", "D(s)"]);
		// The new edits are not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		await pushPromise;

		// The edits are now reflected in the host
		strict.deepEqual([...host.local.root], ["B(s)", "C(s)", "D(s)"]);
		strict.deepEqual([...host.main.root], ["B(s)", "C(s)", "D(s)"]);
		// The edits are not reflected in the peer yet
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();

		// The edits are now reflected in the peer
		strict.deepEqual([...peer.root], ["B(s)", "C(s)", "D(s)"]);
	});

	it("one inbound edit", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit on the peer
		peer.root.push("B(p)");
		// The edit is synchronously reflected in the peer
		strict.deepEqual([...peer.root], ["B(p)"]);
		// The edit is not reflected in the host or the sandbox yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		provider.synchronizeMessages();

		// The edit is now reflected in the host but not the local or sandbox yet
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		// The host should have started the process of updating the sandbox with the inbound change
		const updatePromise =
			host.updatePromise ?? strict.fail("Expected update to be in progress");
		// Wait for the update to be applied to the sandbox
		await updatePromise;

		// The peer edit is now reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["B(p)"]);
		strict.deepEqual([...sandbox.view.root], ["B(p)"]);
	});

	it("new inbound edits during inbound edit update", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit on the peer
		peer.root.push("B(p)");
		provider.synchronizeMessages();
		// The new peer edit is reflected in the host but not the local or sandbox yet.
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		// The host should have started the process of updating the sandbox with the inbound change
		const updatePromise =
			host.updatePromise ?? strict.fail("Expected update to be in progress");

		// Before the update is applied to the sandbox, other edits come in from the peer
		peer.root.push("C(p)");
		peer.root.push("D(p)");
		provider.synchronizeMessages();
		// The new peer edits are reflected in the host but not the local or sandbox yet.
		strict.deepEqual([...host.main.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		await updatePromise;

		// Once the promise resolves, all the peer edits should be reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...sandbox.view.root], ["B(p)", "C(p)", "D(p)"]);
	});

	it("outbound edits win races", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Make edits in the sandbox
		sandbox.view.root.push("B(s)");
		sandbox.view.root.push("C(s)");
		// The outbound edits are synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)"]);
		// The outbound edits are not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The sandbox should have started the process of pushing the edit to the host
		const pushPromise = sandbox.pushPromise ?? strict.fail("Expected push to be in progress");

		// Before the host has a chance to process the edits from the sandbox, the peer makes an edit
		peer.root.push("B(p)");
		strict.deepEqual([...peer.root], ["B(p)"]);
		provider.synchronizeMessages();
		// The peer edit is now reflected in the host but not the local or sandbox yet
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)"]);

		// The host should have started the process of updating the sandbox with the inbound change
		const updatePromise =
			host.updatePromise ?? strict.fail("Expected update to be in progress");

		// Wait for the outbound edits to be pushed to the host
		await pushPromise;

		// The outbound edits are now reflected in the host
		strict.deepEqual([...host.local.root], ["B(s)", "C(s)"]);
		strict.deepEqual([...host.main.root], ["B(s)", "C(s)", "B(p)"]);
		// The outbound edits are not reflected in the peer yet
		strict.deepEqual([...peer.root], ["B(p)"]);

		provider.synchronizeMessages();

		// The outbound edits are now reflected in the peer
		strict.deepEqual([...peer.root], ["B(s)", "C(s)", "B(p)"]);

		// Wait for the update to be applied to the sandbox
		await updatePromise;

		// The peer edit is now reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["B(s)", "C(s)", "B(p)"]);
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)", "B(p)"]);
	});
});
