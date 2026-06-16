/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

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

function makePromiseWithResolver<T>(): [Promise<T>, (value: T) => void] {
	let resolver: (value: T) => void;
	const promise = new Promise<T>((resolve) => {
		resolver = resolve;
	});
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	assert(resolver! !== undefined, "Resolver should have been assigned");
	return [promise, resolver];
}

class Host<const TSchema extends ImplicitFieldSchema> {
	/** The main branch on the host. Is automatically updated when peer changes are received. */
	public readonly main: TreeViewAlpha<TSchema>;
	/** The local branch on the host. Always reflects the state of the sandbox (though lags behind it due to async) */
	public readonly local: TreeViewAlpha<TSchema>;
	private readonly sendUpdate: (change: JsonCompatibleReadOnly) => void;

	private updateInProgress?: [Promise<void>, resolver: () => void];

	public constructor(
		main: TreeViewAlpha<TSchema>,
		sendUpdate: (change: JsonCompatibleReadOnly) => void,
	) {
		this.sendUpdate = sendUpdate;
		this.main = main;
		this.local = main.fork();

		this.main.events.on("changed", (metadata: ChangeMetadata) => {
			if (!metadata.isLocal) {
				this.startInboundUpdate();
			}
		});
	}

	public receiveOutboundChange(change: JsonCompatibleReadOnly): void {
		this.local.applyChange(change);
		this.main.merge(this.local);

		if (this.updateInProgress !== undefined) {
			this.scheduleInboundPush();
		}
	}

	private startInboundUpdate(): void {
		if (this.updateInProgress !== undefined) {
			return;
		}

		this.updateInProgress = makePromiseWithResolver();
		this.scheduleInboundPush();
	}

	private scheduleInboundPush(): void {
		setTimeout(() => {
			const mainAtTheStartOfThePush = this.main.fork();
			const update = this.local.getRebaseChanges(mainAtTheStartOfThePush);
			this.sendUpdate(update);
		});
	}

	public receiveAckOfUpdate(): void {
		assert.notEqual(this.updateInProgress, undefined);
		this.updateInProgress?.[1]();
		this.updateInProgress = undefined;
	}

	public get updatePromise(): Promise<void> | undefined {
		return this.updateInProgress?.[0];
	}
}

class Sandbox<const TSchema extends ImplicitFieldSchema> {
	/** The independent view on the sandbox. */
	public readonly view: TreeViewAlpha<TSchema>;
	/** The number of local changes that have been made in the sandbox but not yet reflected on the host. */
	private inFlight: number = 0;
	private pushInProgress?: [Promise<void>, resolver: () => void];

	private readonly sendAckOfInboundUpdate: () => void;

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		sendOutboundChange: (change: JsonCompatibleReadOnly) => void,
		sendAckOfInboundUpdate: () => void,
	) {
		this.view = independentInitializedView(config, options, content);
		this.sendAckOfInboundUpdate = sendAckOfInboundUpdate;
		this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal) {
				this.pushInProgress ??= makePromiseWithResolver();
				this.inFlight += 1;
				const newChange = metadata.getChange();
				sendOutboundChange(newChange);
			}
		});
	}

	public receiveInboundUpdate(update: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			return;
		}
		this.view.applyChange(update, false);
		this.sendAckOfInboundUpdate();
	}

	public receiveAckOfOutboundChange(): void {
		assert(this.inFlight > 0);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			this.pushInProgress?.[1]();
			this.pushInProgress = undefined;
		}
	}

	public get pushPromise(): Promise<void> | undefined {
		return this.pushInProgress?.[0];
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
		// eslint-disable-next-line prefer-const
		let sandbox: Sandbox<typeof StringArray>;

		function sendInboundUpdateFromHostToSandbox(update: JsonCompatibleReadOnly): void {
			setTimeout(() => {
				sandbox.receiveInboundUpdate(update);
			});
		}

		const host = new Host(main, sendInboundUpdateFromHostToSandbox);

		// TODO: this is a legacy API: we need a stable alternative.
		const idCompressor = createIdCompressor();
		const startingState = TreeAlpha.exportCompressed(host.local.root, {
			idCompressor,
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
				// TODO: how is the sandbox supposed to get the same compressor state as the host?
				idCompressor,
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

		// Wait for the edit to be pushed to the host
		const _ = await (host.updatePromise ?? assert.fail("Expected update to be in progress"));

		// The edit is now reflected in the local and sandbox
		assert.deepEqual([...host.local.root], ["A", "B(p)"]);
		assert.deepEqual([...sandbox.view.root], ["A", "B(p)"]);
	});
});
