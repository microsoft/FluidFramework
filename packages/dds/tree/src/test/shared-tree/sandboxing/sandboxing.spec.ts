/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";

import { assert, fail } from "@fluidframework/core-utils/internal";

import { asAlpha } from "../../../api.js";
import { FluidClientVersion, type ICodecOptions } from "../../../codec/index.js";
import {
	findCommonAncestor,
	type ChangeMetadata,
	type GraphCommit,
	type RevisionTag,
} from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	independentInitializedView,
	SchematizingSimpleTreeView,
	TreeAlpha,
	type ForestOptions,
	type ViewContent,
} from "../../../shared-tree/index.js";
import {
	extractPersistedSchema,
	type TreeViewAlpha,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/index.js";
import {
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type UnsafeUnknownSchema,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { hasSome, type JsonCompatibleReadOnly } from "../../../util/index.js";
import { TestTreeProviderLite, StringArray, createTestUndoRedoStacks } from "../../utils.js";

/**
 * Gets the head commit of a view.
 * Used for debugging and logging purposes only.
 */
function headFromView<TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema>(
	view: TreeViewAlpha<TSchema>,
): GraphCommit<unknown> {
	// Commit information is not exposed via the public APIs,
	// so we rely on implementation details to access it.
	assert(
		view instanceof SchematizingSimpleTreeView,
		"Expected view to be a SchematizingSimpleTreeView",
	);
	return view.checkout.mainBranch.getHead();
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
	 * The promise and resolver for the process of sending changes to the sandbox.
	 * When defined, the sandbox is behind the host's main branch. The promise resolves when the sandbox has caught up with the host's main branch.
	 * When undefined, no update is in progress and the sandbox is up-to-date with the host's main branch.
	 */
	private updateInProgress?: PromiseWithResolver;
	/**
	 * Clone of main branch from when the last update to the sandbox was initiated.
	 */
	private mainHeadFromLastUpdate?: TreeViewAlpha<TSchema>;
	/**
	 * True when the host is applying changes from the sandbox to the main branch.
	 */
	private isApplyingSandboxChanges: boolean = false;
	/**
	 * The callback to unsubscribe from main branch changes.
	 */
	private readonly offMainChanged: () => void;

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The callback to send changes from the host to the sandbox. */
		private readonly sendChangeToSandbox: (change: JsonCompatibleReadOnly) => void,
		/** The callback to acknowledge changes from the sandbox. */
		private readonly ackChangeFromSandbox: () => void,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.main = main;
		this.local = main.fork();

		this.offMainChanged = this.main.events.on("changed", () => {
			if (this.isApplyingSandboxChanges) {
				// While we may need to update the sandbox after applying changes from the sandbox,
				// we don't want to do so until we have sent an acknowledgment back to the sandbox.
			} else {
				this.tryUpdateSandbox("after main branch changed");
			}
		});
	}

	public dispose(): void {
		this.offMainChanged();
		this.local.dispose();
		this.main.dispose();
	}

	/**
	 * Informs the host of a new change made on the sandbox.
	 * This method synchronously applies the change to the host's local and main branches
	 * then asynchronously attempts to update the sandbox if need be.
	 */
	public receiveChangeFromSandbox(change: JsonCompatibleReadOnly): void {
		this.logger(`Host: received change [${getRevision(change)}] from sandbox`);
		if (this.mainHeadFromLastUpdate !== undefined) {
			// There is an update in progress but the sandbox has authored and sent a new change before applying that update.
			// This means that by the time the sandbox processes the update, that update will be out-of-date
			// (because it does not take into account this new change) and will be rejected by the sandbox.
			// A new update will be sent to the sandbox after the new change is taken into account,
			// and that update will be based on the updated main head that includes the new change.
			// We can therefore stop tracking the head of the main branch from when the last update was initiated.
			this.logger(
				`Host:   abandoning update in progress for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
			);
			this.mainHeadFromLastUpdate.dispose();
			this.mainHeadFromLastUpdate = undefined;
		}
		this.local.applyChange(change);
		this.logger(
			`Host:   merging changes from sandbox: ${getMissingCommits(this.main, this.local)}`,
		);
		this.isApplyingSandboxChanges = true;
		this.main.merge(this.local, false);
		this.isApplyingSandboxChanges = false;
		this.ackChangeFromSandbox();
		this.tryUpdateSandbox("after receiving change from sandbox");
	}

	/**
	 * Attempts to send changes to the sandbox if the sandbox is behind the host's main branch.
	 * If the sandbox is already up-to-date with the host's main branch,
	 * or if update is already in progress, then this method has no effect beyond logging.
	 *
	 * @remarks
	 * Updating the sandbox is asynchronous, so the sandbox may still be behind the host's main branch after this method returns.
	 * See {@link updateSandboxPromise} for a promise that resolves when the sandbox is fully up-to-date with the host's main branch.
	 *
	 * @param prompt - A string to include in the log message to indicate why the sandbox update is being considered.
	 */
	private tryUpdateSandbox(prompt: string): void {
		this.logger(`Host: considering sync ${prompt}...`);
		if (this.local.isMissingEditsFrom(this.main)) {
			this.logger(
				`Host:   detected changes that need to be reflected in sandbox ${getMissingCommits(this.local, this.main)}`,
			);
			if (this.mainHeadFromLastUpdate !== undefined) {
				this.logger(
					"Host:   update already in progress. Will wait for it to complete or fail.",
				);
				return;
			}
			if (this.updateInProgress === undefined) {
				this.logger(
					"Host:   no pre-existing update in progress. Creating new update promise.",
				);
				this.updateInProgress = makePromiseWithResolver();
			} else {
				this.logger("Host:   Reusing existing update promise.");
			}
			this.mainHeadFromLastUpdate = this.main.fork();
			const update = this.local.computeNetChangeIfRebasedOnto(this.mainHeadFromLastUpdate);
			assert(
				update !== undefined,
				"Expected update to be defined since local is missing edits from main",
			);
			this.logger("Host:   sending update to sandbox");
			this.sendChangeToSandbox(update);
		} else {
			this.logger("Host:   no changes that need to be reflected in sandbox");
			// The sandbox is now caught up with the host's main branch
			if (this.updateInProgress !== undefined) {
				this.logger("Host:   resolving update promise");
				const resolver = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolver();
			}
		}
	}

	/**
	 * Informs the host that the sandbox has acknowledged a change that the host has sent.
	 * This allows the host to reflect the acknowledged change on the local branch.
	 * This may also trigger the host to send new changes to the sandbox if the sandbox is currently behind the host's main branch.
	 */
	public receiveAckFromSandbox(): void {
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
		this.tryUpdateSandbox("after receiving ack of update");
	}

	/**
	 * Returns a promise that resolves when all changes know to the host have been reflected in the sandbox,
	 * or undefined if all such changes have already been reflected on the sandbox.
	 *
	 * If new changes are received while a promise is already in progress,
	 * the existing promise will only resolve once all sandbox-bound changes (including the new ones) have been reflected in the sandbox.
	 * This means that there's no need to call this function again after receiving new changes if the previous promise is still pending.
	 */
	public get updateSandboxPromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}
}

class Sandbox<const TSchema extends ImplicitFieldSchema> {
	/** The independent view on the sandbox. */
	public readonly view: TreeViewAlpha<TSchema>;
	/** The number of local changes that have been made in the sandbox but not yet reflected on the host. */
	private inFlight: number = 0;
	/**
	 * The promise and resolver for the process of sending changes to the host.
	 * When defined, the host has not yet acknowledged the sandbox changes.
	 * The promise resolves when the host acknowledges the sandbox changes.
	 * When undefined, the host is up-to-date with the sandbox.
	 */
	private pushInProgress?: PromiseWithResolver;
	/**
	 * Callback to unsubscribe from view changes.
	 */
	private readonly offViewChanged: () => void;
	/**
	 * True when the sandbox is applying changes from the host.
	 */
	private isApplyingChangesFromHost: boolean = false;

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		/** The callback to send changes from to the host. */
		sendChangeToHost: (change: JsonCompatibleReadOnly) => void,
		/** The callback to send acknowledgements of changes received from the host. */
		private readonly ackChangeFromHost: () => void,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.view = independentInitializedView(config, options, content);
		this.offViewChanged = this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal && !this.isApplyingChangesFromHost) {
				const newChange = metadata.getChange();
				this.logger(
					`Sand: new change [${getRevision(newChange)}] (inFlight:${this.inFlight}->${this.inFlight + 1})`,
				);
				if (this.pushInProgress === undefined) {
					this.logger("Sand:   no pre-existing push in progress. Creating new push promise.");
					this.pushInProgress = makePromiseWithResolver();
				} else {
					this.logger("Sand:   Reusing existing push promise.");
				}
				this.inFlight += 1;
				sendChangeToHost(newChange);
			}
		});
	}

	public dispose(): void {
		this.offViewChanged();
		this.view.dispose();
	}

	/**
	 * Attempts to apply a change from the host.
	 * The change is ignored if there are local changes that have not yet been reflected on the host.
	 * The `ackChangeFromHost` callback will be invoked iff the update is applied.
	 * @param change - The change to apply.
	 */
	public receiveChangeFromHost(change: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			// There are local changes that have not yet been reflected on the host,
			// so this change is not applicable to the current state of the sandbox.
			// We ignore it (another will come once the host has caught up to the sandbox).
			this.logger(`Sand: ignoring update from host (inFlight=${this.inFlight})`);
			return;
		}
		this.isApplyingChangesFromHost = true;
		this.view.applyChange(change);
		this.isApplyingChangesFromHost = false;
		this.logger("Sand: applied update from host");
		this.ackChangeFromHost();
	}

	/**
	 * Must be called when the host acknowledges a new local change.
	 */
	public receiveAckFromHost(): void {
		assert(this.inFlight > 0, "Unexpectedly received ack from host");
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
			this.logger(`Sand:   all my changes were acked. Resolving push promise.`);
			resolver();
		}
	}

	/**
	 * Returns a promise that resolves when all changes made on the sandbox have been acknowledged by the host.
	 * Undefined if there are no such changes in flight.
	 *
	 * If new local changes are made while a promise is already in progress,
	 * the existing promise will only resolve once all local changes (including the new ones) have been reflected on the host.
	 * This means that there's no need to call this function again after making new local changes if the previous promise is still pending.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}
}

describe("Host and Sandbox Demo", () => {
	/**
	 * The set of functions that are used to emulate communications between the host and sandbox.
	 */
	interface InteropFunctions {
		readonly sendChangeFromHostToSandbox: (update: JsonCompatibleReadOnly) => void;
		readonly sendChangeFromSandboxToHost: (change: JsonCompatibleReadOnly) => void;
		readonly sendAckOfHostBoundChangeFromHostToSandbox: () => void;
		readonly sendAckOfSandboxBoundChangeFromSandboxToHost: () => void;
	}

	/**
	 * A function that builds interop functions given getters for the host and sandbox.
	 */
	type InteropFunctionsBuilder<T extends InteropFunctions> = (
		getHost: () => Host<typeof StringArray>,
		getSandbox: () => Sandbox<typeof StringArray>,
	) => T;

	/**
	 * Builds interop functions that use setTimeout to simulate async communication between the host and sandbox.
	 * @param getHost - A function that returns the host. Used to avoid circular dependencies when building the interop functions.
	 * @param getSandbox - A function that returns the sandbox. Used to avoid circular dependencies when building the interop functions.
	 * @returns An object containing the interop functions.
	 */
	function buildTimeoutInterop(
		getHost: () => Host<typeof StringArray>,
		getSandbox: () => Sandbox<typeof StringArray>,
	): InteropFunctions {
		return {
			sendChangeFromHostToSandbox: (update: JsonCompatibleReadOnly): void => {
				setTimeout(() => getSandbox().receiveChangeFromHost(update));
			},
			sendChangeFromSandboxToHost: (change: JsonCompatibleReadOnly): void => {
				setTimeout(() => getHost().receiveChangeFromSandbox(change));
			},
			sendAckOfHostBoundChangeFromHostToSandbox: (): void => {
				setTimeout(() => getSandbox().receiveAckFromHost());
			},
			sendAckOfSandboxBoundChangeFromSandboxToHost: (): void => {
				setTimeout(() => getHost().receiveAckFromSandbox());
			},
		};
	}

	/**
	 * Sets up a host, sandbox, and peer with the given initial state and timeout-based interop functions.
	 * @param initialState - The initial state of the shared tree.
	 * @returns An object containing the host, sandbox, peer, and interop functions.
	 */
	function setup(initialState: string[]) {
		return setupCustom(initialState, buildTimeoutInterop);
	}

	/**
	 * Sets up a host, sandbox, and peer with the given initial state and custom interop functions.
	 * @param initialState - The initial state of the shared tree.
	 * @param interopBuilder - A function that builds the interop functions.
	 * @param logging - Whether to enable logging.
	 * @returns An object containing the host, sandbox, peer, and interop functions.
	 */
	function setupCustom<T extends InteropFunctions>(
		initialState: string[],
		interopBuilder: InteropFunctionsBuilder<T>,
		logging: boolean = false,
	) {
		const logger = (message: string) => {
			if (logging) {
				console.log(message);
			}
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
		// eslint-disable-next-line prefer-const -- it is assigned below
		let host: Host<typeof StringArray>;

		const interop = interopBuilder(
			() => host ?? fail("Interop function called before host was initialized"),
			() => sandbox ?? fail("Interop function called before sandbox was initialized"),
		);

		host = new Host(
			main,
			interop.sendChangeFromHostToSandbox,
			interop.sendAckOfHostBoundChangeFromHostToSandbox,
			logger,
		);

		const hostCompressor = provider.getCompressor(provider.trees[1]);
		const startingState = TreeAlpha.exportCompressed(host.local.root, {
			// TODO: shard the compressor here?
			idCompressor: hostCompressor,
			minVersionForCollab: FluidClientVersion.v2_80,
		});

		sandbox = new Sandbox(
			config,
			{ jsonValidator: FormatValidatorBasic },
			{
				tree: startingState,
				schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
				// TODO: shard the compressor here?
				idCompressor: hostCompressor,
			},
			interop.sendChangeFromSandboxToHost,
			interop.sendAckOfSandboxBoundChangeFromSandboxToHost,
			logger,
		);

		const teardown = () => {
			sandbox.dispose();
			host.dispose();
		};

		return { teardown, peer, host, sandbox, provider, interop, logger };
	}

	it("the initial state is consistent across the host and sandbox", async () => {
		const { host, sandbox } = setup(["A"]);
		strict.deepEqual([...sandbox.view.root], ["A"]);
		strict.deepEqual([...host.local.root], ["A"]);
		strict.deepEqual([...host.main.root], ["A"]);
	});

	it("one sandbox edit", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit in the sandbox
		sandbox.view.root.push("B(s)");
		// The edit is synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)"]);
		// The edit is not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The sandbox should have started the process of pushing the edit to the host
		const pushPromise =
			sandbox.updateHostPromise ?? strict.fail("Expected push to be in progress");
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

	it("new sandbox edits during sandbox edit push", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit in the sandbox
		sandbox.view.root.push("B(s)");
		// The edit is synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)"]);
		// The edit is not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The sandbox should have started the process of pushing the edit to the host
		const pushPromise =
			sandbox.updateHostPromise ?? strict.fail("Expected push to be in progress");

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

	it("one peer edit", async () => {
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

		// The host should have started the process of updating the sandbox with the peer change
		const updatePromise =
			host.updateSandboxPromise ?? strict.fail("Expected update to be in progress");
		// Wait for the update to be applied to the sandbox
		await updatePromise;

		// The peer edit is now reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["B(p)"]);
		strict.deepEqual([...sandbox.view.root], ["B(p)"]);
	});

	it("new peer edits during sandbox update", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Edit on the peer
		peer.root.push("B(p)");
		provider.synchronizeMessages();
		// The new peer edit is reflected in the host but not the local or sandbox yet.
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		// The host should have started the process of updating the sandbox with the peer change
		const updatePromise =
			host.updateSandboxPromise ?? strict.fail("Expected update to be in progress");

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

	it("attempts by the host and sandbox to concurrently notify one-another of concurrent edits do not lead to inconsistencies or dropped edits", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Make edits in the sandbox
		sandbox.view.root.push("B(s)");
		sandbox.view.root.push("C(s)");
		// The sandbox edits are synchronously reflected in the sandbox
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)"]);
		// The sandbox edits are not reflected in the host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The sandbox should have started the process of pushing the edit to the host
		const pushPromise =
			sandbox.updateHostPromise ?? strict.fail("Expected push to be in progress");

		// Before the host has a chance to process the edits from the sandbox, the peer makes an edit
		peer.root.push("B(p)");
		strict.deepEqual([...peer.root], ["B(p)"]);
		provider.synchronizeMessages();
		// The peer edit is now reflected in the host but not the local or sandbox yet
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)"]);

		// The host should have started the process of updating the sandbox with the peer change
		const updatePromise =
			host.updateSandboxPromise ?? strict.fail("Expected update to be in progress");

		// Wait for the sandbox edits to be pushed to the host
		await pushPromise;

		// The sandbox edits are now reflected in the host
		strict.deepEqual([...host.local.root], ["B(s)", "C(s)"]);
		strict.deepEqual([...host.main.root], ["B(s)", "C(s)", "B(p)"]);
		// The sandbox edits are not reflected in the peer yet
		strict.deepEqual([...peer.root], ["B(p)"]);

		provider.synchronizeMessages();

		// The sandbox edits are now reflected in the peer
		strict.deepEqual([...peer.root], ["B(s)", "C(s)", "B(p)"]);

		// Wait for the update to be applied to the sandbox
		await updatePromise;

		// The peer edit is now reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["B(s)", "C(s)", "B(p)"]);
		strict.deepEqual([...sandbox.view.root], ["B(s)", "C(s)", "B(p)"]);
	});

	it("host edits sequenced before peer edits", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Make an edit on the host
		host.main.root.push("H");
		strict.deepEqual([...host.main.root], ["H"]);

		// The sandbox edits are not reflected in the sandbox or peer yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);
		strict.deepEqual([...peer.root], []);

		// The host should have started the process of updating the sandbox with the peer change
		const updatePromise =
			host.updateSandboxPromise ?? strict.fail("Expected update to be in progress");

		// Before the sandbox has a chance to process the edits from the host, the peer makes an edit
		peer.root.push("P");
		strict.deepEqual([...peer.root], ["P"]);

		provider.synchronizeMessages();
		// The peer and host edits are sequenced
		strict.deepEqual([...host.main.root], ["P", "H"]);
		strict.deepEqual([...peer.root], ["P", "H"]);

		// The sandbox is still in the process of updating
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		// Wait for the update to be applied to the sandbox
		await updatePromise;

		// The peer edit is now reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["P", "H"]);
		strict.deepEqual([...sandbox.view.root], ["P", "H"]);
	});

	it("peer edits sequenced before host edits", async () => {
		const { peer, host, sandbox, provider } = setup([]);

		// Make an edit on the peer
		peer.root.push("P");
		strict.deepEqual([...peer.root], ["P"]);

		// Make an edit on the host
		host.main.root.push("H");
		strict.deepEqual([...host.main.root], ["H"]);

		// The host should have started the process of updating the sandbox with the peer change
		const updatePromise =
			host.updateSandboxPromise ?? strict.fail("Expected update to be in progress");

		provider.synchronizeMessages();

		// The peer and host edits are sequenced
		strict.deepEqual([...host.main.root], ["H", "P"]);
		strict.deepEqual([...peer.root], ["H", "P"]);

		// The sandbox is still in the process of updating
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...sandbox.view.root], []);

		// Wait for the update to be applied to the sandbox
		await updatePromise;

		// The peer edit is now reflected in the local and sandbox
		strict.deepEqual([...host.local.root], ["H", "P"]);
		strict.deepEqual([...sandbox.view.root], ["H", "P"]);
	});

	it("sandbox edits can be reverted", async () => {
		const { host, sandbox } = setup([]);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
			sandbox.view.events,
		);

		// Make undoable edits in the sandbox
		sandbox.view.root.push("Sa");
		sandbox.view.root.push("Sb");
		sandbox.view.root.push("Sc");
		strict.deepEqual([...sandbox.view.root], ["Sa", "Sb", "Sc"]);
		strict.deepEqual(undoStack.length, 3, "Expected undo stack to have 3 entries");

		// The sandbox should have started the process of pushing the edit to the host
		let pushPromise =
			sandbox.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...sandbox.view.root], ["Sa", "Sb", "Sc"]);
		strict.deepEqual([...host.local.root], ["Sa", "Sb", "Sc"]);
		strict.deepEqual([...host.main.root], ["Sa", "Sb", "Sc"]);

		// Make an edit on the host
		host.main.root.insertAtStart("H");
		strict.deepEqual([...host.main.root], ["H", "Sa", "Sb", "Sc"]);

		// Wait for the update to be applied to the sandbox
		const updatePromise =
			host.updateSandboxPromise ?? strict.fail("Expected update to be in progress");
		await updatePromise;

		strict.deepEqual([...host.local.root], ["H", "Sa", "Sb", "Sc"]);
		strict.deepEqual([...sandbox.view.root], ["H", "Sa", "Sb", "Sc"]);

		strict.deepEqual(
			undoStack.length,
			4,
			"Expected host change to add an entry to the undo stack",
		);
		undoStack.pop()?.dispose();

		// Undo the sandbox edits
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();

		// The sandbox should have started the process of pushing the edits to the host
		pushPromise = sandbox.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...sandbox.view.root], ["H"]);
		strict.deepEqual([...host.local.root], ["H"]);
		strict.deepEqual([...host.main.root], ["H"]);
		assert(redoStack.length === 3, "Expected redo stack to have 3 entries");

		// Undo the sandbox edits
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();

		// The sandbox should have started the process of pushing the edits to the host
		pushPromise = sandbox.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...host.local.root], ["H", "Sa", "Sb", "Sc"]);
		strict.deepEqual([...sandbox.view.root], ["H", "Sa", "Sb", "Sc"]);
		unsubscribe();
	});

	// TODO: investigate and fix the memory leaks in this test, then run it with higher number of steps.
	it("All permutations", function () {
		this.timeout(20_000);
		/**
		 * The number of {@link Step | steps} in each scenario.
		 */
		const maxSteps = 4;
		/**
		 * A potential action that could be taken at each step of a run.
		 */
		enum Step {
			/** Make an edit on the host */
			HostEdit = "He",
			/** Make an edit on the sandbox */
			SandboxEdit = "Ve",
			/** Make an edit on the peer */
			PeerEdit = "Pe",
			/** Make the host receive a sequenced edit from the peer */
			SequenceEdit = "Se",
			/** Make the host receive its own sequenced edit */
			SequenceAck = "Sa",
			/** Notify the sandbox of an update sent by the host. */
			HostToSandboxEdit = "H2Se",
			/** Notify the host of a sandbox-bound update ack sent by the sandbox. */
			SandboxToHostAck = "S2Ha",
			/** Notify the host of an edit sent by the sandbox. */
			SandboxToHostEdit = "S2He",
			/** Notify the sandbox of an host-bound edit ack sent by the host. */
			HostToSandboxAck = "H2Sa",
		}

		type Ack = "Ack";
		const Ack: Ack = "Ack";
		type Message = JsonCompatibleReadOnly | Ack;
		interface QueueInteropFunctions extends InteropFunctions {
			readonly hostToSandbox: Message[];
			readonly sandboxToHost: Message[];

			dispatchToSandbox(): void;
			dispatchToHost(): void;
		}

		/**
		 * Generates a set of interop functions that keep messages in queues,
		 * making it possible to control which queue progresses and when.
		 * @param getHost - A function that returns the host instance.
		 * @param getSandbox - A function that returns the sandbox instance.
		 * @returns An object containing the queued interop functions.
		 */
		function buildQueueInterop(
			getHost: () => Host<typeof StringArray>,
			getSandbox: () => Sandbox<typeof StringArray>,
		): QueueInteropFunctions {
			const out: QueueInteropFunctions = {
				hostToSandbox: [],
				sandboxToHost: [],
				sendChangeFromHostToSandbox: (update: JsonCompatibleReadOnly): void => {
					out.hostToSandbox.push(update);
				},
				dispatchToSandbox: (): void => {
					const message =
						out.hostToSandbox.shift() ?? fail("No sandbox-bound changes in the queue");
					if (message === Ack) {
						getSandbox().receiveAckFromHost();
					} else {
						getSandbox().receiveChangeFromHost(message);
					}
				},
				sendAckOfSandboxBoundChangeFromSandboxToHost: (): void => {
					out.sandboxToHost.push(Ack);
				},
				sendChangeFromSandboxToHost: (change: JsonCompatibleReadOnly): void => {
					out.sandboxToHost.push(change);
				},
				dispatchToHost: (): void => {
					const message = out.sandboxToHost.shift() ?? fail("No host-bound changes in queue");
					if (message === Ack) {
						getHost().receiveAckFromSandbox();
					} else {
						getHost().receiveChangeFromSandbox(message);
					}
				},
				sendAckOfHostBoundChangeFromHostToSandbox: (): void => {
					out.hostToSandbox.push(Ack);
				},
			};
			return out;
		}

		type Edit = "Edit";
		const Edit: Edit = "Edit";
		let scenario = 0;
		/**
		 * The steps that could be taken at each step of a run.
		 * The inner arrays represents alternative steps that could be taken at that step of the run.
		 * The outer array represents the steps of the run.
		 *
		 * Note: to test a specific scenario, you can initialize `potential` with a specific sequence of steps.
		 * E.g., `[[Step.SandboxEdit], [Step.SandboxEdit], [Step.Sandbox2HostEdit], [Step.SequenceAck], [Step.Sandbox2HostEdit], [Step.SequenceAck]]`.
		 */
		const potential: Step[][] = [[Step.SandboxEdit, Step.HostEdit, Step.PeerEdit]];
		while (hasSome(potential)) {
			scenario += 1;
			const { teardown, peer, host, sandbox, provider, interop, logger } = setupCustom(
				[],
				buildQueueInterop,
				false,
			);
			let peerEditCounter = 0;
			let hostEditCounter = 0;
			let sandboxEditCounter = 0;
			const serviceQueue: (Step.SequenceEdit | Step.SequenceAck)[] = [];
			const offPeerChange = peer.events.on("changed", ({ isLocal }) => {
				if (isLocal) {
					serviceQueue.push(Step.SequenceEdit);
				}
			});
			const offHostChange = host.main.events.on("changed", ({ isLocal }) => {
				if (isLocal) {
					serviceQueue.push(Step.SequenceAck);
				}
			});
			const actual: Step[] = [];
			while (actual.length < maxSteps) {
				if (actual.length === potential.length) {
					const potentialNext: Step[] = [Step.SandboxEdit, Step.HostEdit, Step.PeerEdit];
					if (hasSome(serviceQueue)) {
						potentialNext.push(serviceQueue[0]);
					}
					if (hasSome(interop.hostToSandbox)) {
						potentialNext.push(
							interop.hostToSandbox[0] === Ack
								? Step.HostToSandboxAck
								: Step.HostToSandboxEdit,
						);
					}
					if (hasSome(interop.sandboxToHost)) {
						potentialNext.push(
							interop.sandboxToHost[0] === Ack
								? Step.SandboxToHostAck
								: Step.SandboxToHostEdit,
						);
					}
					potential.push(potentialNext);
				}
				const step: Step = potential[actual.length][0] ?? fail("No next step available");
				logger(`--> [${actual.join(", ")}] + ${step}`);
				switch (step) {
					case Step.SandboxEdit: {
						sandboxEditCounter += 1;
						sandbox.view.root.push(`V${sandboxEditCounter}`);
						break;
					}
					case Step.HostEdit: {
						hostEditCounter += 1;
						host.main.root.push(`H${hostEditCounter}`);
						break;
					}
					case Step.PeerEdit: {
						peerEditCounter += 1;
						peer.root.push(`P${peerEditCounter}`);
						break;
					}
					case Step.SequenceEdit:
					case Step.SequenceAck: {
						const expected = serviceQueue.shift();
						strict.equal(expected, step);
						let nextMessage = provider.peekNextMessage();
						while (
							nextMessage?.type === "op" &&
							(nextMessage.contents as { type?: string }).type === "idAllocation"
						) {
							provider.synchronizeMessages({ count: 1 });
							nextMessage = provider.peekNextMessage();
						}
						provider.synchronizeMessages({ count: 1 });
						break;
					}
					case Step.HostToSandboxEdit:
					case Step.HostToSandboxAck: {
						interop.dispatchToSandbox();
						break;
					}
					case Step.SandboxToHostEdit:
					case Step.SandboxToHostAck: {
						interop.dispatchToHost();
						break;
					}
					default: {
						throw new Error(`Unexpected step: ${step}`);
					}
				}
				actual.push(step);
				if (interop.hostToSandbox.length === 0 && interop.sandboxToHost.length === 0) {
					strict.deepEqual([...host.main.root], [...sandbox.view.root]);
					strict.deepEqual([...host.local.root], [...sandbox.view.root]);
				}

				if (host.updateSandboxPromise === undefined) {
					strict.equal(host.local.isMissingEditsFrom(host.main), false);
				}

				if (actual.length === maxSteps) {
					potential.push([]);
					do {
						potential.pop();
						potential.at(-1)?.shift();
					} while (potential.at(-1)?.length === 0);
				}
			}
			offPeerChange();
			offHostChange();
			teardown();
		}
		console.log(`${scenario} scenarios tested`);
	});
});
