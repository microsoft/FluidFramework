/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { asAlpha } from "../../api.js";
import { FluidClientVersion, type ICodecOptions } from "../../codec/index.js";
import type { ChangeMetadata } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	independentInitializedView,
	TreeAlpha,
	type ForestOptions,
	type ViewContent,
} from "../../shared-tree/index.js";
import {
	extractPersistedSchema,
	type TreeViewAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/api/index.js";
import { TreeViewConfiguration, type ImplicitFieldSchema } from "../../simple-tree/index.js";
import { configuredSharedTree } from "../../treeFactory.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { TestTreeProviderLite, StringArray } from "../utils.js";

interface PromiseWithResolver {
	readonly promise: Promise<void>;
	readonly resolver: () => void;
}

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

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The callback to send updates from the host to the sandbox so that it learns about inbound changes. */
		private readonly sendUpdate: (change: JsonCompatibleReadOnly) => void,
	) {
		this.main = main;
		this.local = main.fork();

		this.main.events.on("changed", (metadata: ChangeMetadata) => {
			if (!metadata.isLocal) {
				this.syncSandboxToInboundChanges();
			}
		});
	}

	public receiveOutboundChange(change: JsonCompatibleReadOnly): void {
		this.local.applyChange(change);
		this.main.merge(this.local);

		if (this.updateInProgress !== undefined) {
			this.syncSandboxToInboundChanges();
		}
	}

	private syncSandboxToInboundChanges(): void {
		if (this.local.hasNewEdits(this.main)) {
			if (this.updateInProgress !== undefined) {
				// We're already in the process of updating the sandbox.
				return;
			}
			this.updateInProgress = makePromiseWithResolver();
			const update = this.local.computeNetChangeIfRebasedOnto(this.main);
			this.sendUpdate(update);
		} else {
			// The sandbox is now caught up with the host's main branch
			if (this.updateInProgress !== undefined) {
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
		assert.notEqual(this.updateInProgress, undefined);
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
	) {
		this.view = independentInitializedView(config, options, content);
		this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal) {
				this.pushInProgress ??= makePromiseWithResolver();
				this.inFlight += 1;
				const newChange = metadata.getChange();
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
			return;
		}
		this.view.applyChange(update, false);
		this.sendAckOfInboundUpdate();
	}

	/**
	 * Must be called when the host acknowledges a new local change.
	 */
	public receiveAckOfOutboundChange(): void {
		assert(this.inFlight > 0);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			// The host has now caught up with all local changes
			assert(this.pushInProgress !== undefined);
			const resolver = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			// Resolve the push promise
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
	function setup() {
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
		peer.initialize(["A"]);
		provider.synchronizeMessages();

		const main = asAlpha(provider.trees[1].viewWith(config));
		// eslint-disable-next-line prefer-const -- it is assigned below
		let sandbox: Sandbox<typeof StringArray>;

		function sendInboundUpdateFromHostToSandbox(update: JsonCompatibleReadOnly): void {
			setTimeout(() => {
				sandbox.receiveInboundUpdate(update);
			});
		}

		const host = new Host(main, sendInboundUpdateFromHostToSandbox);

		const hostCompressor = provider.getCompressor(provider.trees[1]);
		const startingState = TreeAlpha.exportCompressed(host.local.root, {
			// TODO: shard the compressor here?
			idCompressor: hostCompressor,
			minVersionForCollab: FluidClientVersion.v2_80,
		});

		function sendOutboundChangeFromSandboxToHostLocalBranch(
			change: JsonCompatibleReadOnly,
		): void {
			setTimeout(() => {
				host.receiveOutboundChange(change);
				setTimeout(() => sandbox.receiveAckOfOutboundChange());
			});
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
		);

		return { peer, host, sandbox, provider };
	}

	it("one outbound edit", async () => {
		const { peer, host, sandbox, provider } = setup();

		// The sandbox starts with the same content as the host and the peer
		assert.deepEqual([...sandbox.view.root], ["A"]);
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);
		assert.deepEqual([...peer.root], ["A"]);

		// Edit in the sandbox
		sandbox.view.root.push("B(s)");
		// The edit is synchronously reflected in the sandbox
		assert.deepEqual([...sandbox.view.root], ["A", "B(s)"]);
		// The edit is not reflected in the host yet
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);

		// Wait for the edit to be pushed to the host
		const _ = await (sandbox.pushPromise ?? assert.fail("Expected push to be in progress"));

		// The edit is now reflected in the host
		assert.deepEqual([...host.local.root], ["A", "B(s)"]);
		assert.deepEqual([...host.main.root], ["A", "B(s)"]);
		// The edit is not reflected in the peer yet
		assert.deepEqual([...peer.root], ["A"]);

		provider.synchronizeMessages();

		// The edit is now reflected in the peer
		assert.deepEqual([...peer.root], ["A", "B(s)"]);
	});

	it("one inbound edit", async () => {
		const { peer, host, sandbox, provider } = setup();

		// The sandbox starts with the same content as the host and the peer
		assert.deepEqual([...sandbox.view.root], ["A"]);
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);
		assert.deepEqual([...peer.root], ["A"]);

		// Edit on the peer
		peer.root.push("B(p)");
		// The edit is synchronously reflected in the peer
		assert.deepEqual([...peer.root], ["A", "B(p)"]);
		// The edit is not reflected in the host or the sandbox yet
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);
		assert.deepEqual([...sandbox.view.root], ["A"]);

		provider.synchronizeMessages();

		// The edit is now reflected in the host but not the local or sandbox yet
		assert.deepEqual([...host.main.root], ["A", "B(p)"]);
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...sandbox.view.root], ["A"]);

		// Wait for the update to be applied to the sandbox
		const _ = await (host.updatePromise ?? assert.fail("Expected update to be in progress"));

		// The peer edit is now reflected in the local and sandbox
		assert.deepEqual([...host.local.root], ["A", "B(p)"]);
		assert.deepEqual([...sandbox.view.root], ["A", "B(p)"]);
	});

	it("outbound edit wins races", async () => {
		const { peer, host, sandbox, provider } = setup();

		// The sandbox starts with the same content as the host and the peer
		assert.deepEqual([...sandbox.view.root], ["A"]);
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);
		assert.deepEqual([...peer.root], ["A"]);

		// Make edits in the sandbox
		sandbox.view.root.push("B(s)");
		sandbox.view.root.push("C(s)");
		// The outbound edits are synchronously reflected in the sandbox
		assert.deepEqual([...sandbox.view.root], ["A", "B(s)", "C(s)"]);
		// The outbound edits are not reflected in the host yet
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...host.main.root], ["A"]);

		// Before the host has a chance to process the edits from the sandbox, the peer makes an edit
		peer.root.push("B(p)");
		assert.deepEqual([...peer.root], ["A", "B(p)"]);
		provider.synchronizeMessages();
		// The peer edit is now reflected in the host but not the local or sandbox yet
		assert.deepEqual([...host.main.root], ["A", "B(p)"]);
		assert.deepEqual([...host.local.root], ["A"]);
		assert.deepEqual([...sandbox.view.root], ["A", "B(s)", "C(s)"]);

		// Wait for the outbound edits to be pushed to the host
		const _push = await (sandbox.pushPromise ??
			assert.fail("Expected push to be in progress"));

		// The outbound edits are now reflected in the host
		assert.deepEqual([...host.local.root], ["A", "B(s)", "C(s)"]);
		assert.deepEqual([...host.main.root], ["A", "B(s)", "C(s)", "B(p)"]);
		// The outbound edits are not reflected in the peer yet
		assert.deepEqual([...peer.root], ["A"]);

		provider.synchronizeMessages();

		// The outbound edits are now reflected in the peer
		assert.deepEqual([...peer.root], ["A", "B(s)", "C(s)", "B(p)"]);

		// Wait for the update to be applied to the sandbox
		const _update = await (host.updatePromise ??
			assert.fail("Expected update to be in progress"));

		// The peer edit is now reflected in the local and sandbox
		assert.deepEqual([...host.local.root], ["A", "B(s)", "C(s)", "B(p)"]);
		assert.deepEqual([...sandbox.view.root], ["A", "B(s)", "C(s)", "B(p)"]);
	});
});
