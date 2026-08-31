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
	/** The main branch on the Host. Is automatically updated when peer changes are received. */
	public readonly main: TreeViewAlpha<TSchema>;
	/** The local branch on the Host. Always reflects the state of the Guest (though lags behind it due to async) */
	public readonly local: TreeViewAlpha<TSchema>;
	/**
	 * The promise and resolver for the process of sending changes to the Guest.
	 * When defined, the Guest is behind the Host's main branch. The promise resolves when the Guest has caught up with the Host's main branch.
	 * When undefined, no update is in progress and the Guest is up-to-date with the Host's main branch.
	 */
	private updateInProgress?: PromiseWithResolver;
	/**
	 * Clone of main branch from when the last update to the Guest was initiated.
	 */
	private mainHeadFromLastUpdate?: TreeViewAlpha<TSchema>;
	/**
	 * True when the Host is applying changes from the Guest to the main branch.
	 */
	private isApplyingGuestChanges: boolean = false;
	/**
	 * The callback to unsubscribe from main branch changes.
	 */
	private readonly offMainChanged: () => void;

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The callback to send changes from the Host to the Guest. */
		private readonly sendChangeToGuest: (change: JsonCompatibleReadOnly) => void,
		/** The callback to acknowledge changes from the Guest. */
		private readonly ackChangeFromGuest: () => void,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.main = main;
		this.local = main.fork();

		this.offMainChanged = this.main.events.on("changed", () => {
			if (this.isApplyingGuestChanges) {
				// While we may need to update the Guest after applying changes from the Guest,
				// we don't want to do so until we have sent an acknowledgment back to the Guest.
			} else {
				this.tryUpdateGuest("after main branch changed");
			}
		});
	}

	public dispose(): void {
		this.offMainChanged();
		this.local.dispose();
		this.main.dispose();
	}

	/**
	 * Informs the Host of a new change made on the Guest.
	 * This method synchronously applies the change to the Host's local and main branches
	 * then asynchronously attempts to update the Guest if need be.
	 */
	public receiveChangeFromGuest(change: JsonCompatibleReadOnly): void {
		this.logger(`Host: received change [${getRevision(change)}] from Guest`);
		if (this.mainHeadFromLastUpdate !== undefined) {
			// There is an update in progress but the Guest has authored and sent a new change before applying that update.
			// This means that by the time the Guest processes the update, that update will be out-of-date
			// (because it does not take into account this new change) and will be rejected by the Guest.
			// A new update will be sent to the Guest after the new change is taken into account,
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
			`Host:   merging changes from Guest: ${getMissingCommits(this.main, this.local)}`,
		);
		this.isApplyingGuestChanges = true;
		this.main.merge(this.local, false);
		this.isApplyingGuestChanges = false;
		this.ackChangeFromGuest();
		this.tryUpdateGuest("after receiving change from Guest");
	}

	/**
	 * Attempts to send changes to the Guest if the Guest is behind the Host's main branch.
	 * If the Guest is already up-to-date with the Host's main branch,
	 * or if update is already in progress, then this method has no effect beyond logging.
	 *
	 * @remarks
	 * Updating the Guest is asynchronous, so the Guest may still be behind the Host's main branch after this method returns.
	 * See {@link updateGuestPromise} for a promise that resolves when the Guest is fully up-to-date with the Host's main branch.
	 *
	 * @param prompt - A string to include in the log message to indicate why the Guest update is being considered.
	 */
	private tryUpdateGuest(prompt: string): void {
		this.logger(`Host: considering sync ${prompt}...`);
		if (this.local.isMissingEditsFrom(this.main)) {
			this.logger(
				`Host:   detected changes that need to be reflected in Guest ${getMissingCommits(this.local, this.main)}`,
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
			this.logger("Host:   sending update to Guest");
			this.sendChangeToGuest(update);
		} else {
			this.logger("Host:   no changes that need to be reflected in Guest");
			// The Guest is now caught up with the Host's main branch
			if (this.updateInProgress !== undefined) {
				this.logger("Host:   resolving update promise");
				const resolver = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolver();
			}
		}
	}

	/**
	 * Informs the Host that the Guest has acknowledged a change that the Host has sent.
	 * This allows the Host to reflect the acknowledged change on the local branch.
	 * This may also trigger the Host to send new changes to the Guest if the Guest is currently behind the Host's main branch.
	 */
	public receiveAckFromGuest(): void {
		assert(this.updateInProgress !== undefined, "Expected update to be in progress");
		assert(
			this.mainHeadFromLastUpdate !== undefined,
			"Expected main head from last update to be defined",
		);
		this.logger(
			`Host: received ack of update from Guest for ${getMissingCommits(this.local, this.mainHeadFromLastUpdate)}`,
		);
		// Reflect the acknowledged update on the local branch
		this.local.rebaseOnto(this.mainHeadFromLastUpdate);
		this.mainHeadFromLastUpdate.dispose();
		this.mainHeadFromLastUpdate = undefined;
		// New changes could have come in since the update was sent,
		// so we try to sync again to ensure the Guest is fully up-to-date.
		this.tryUpdateGuest("after receiving ack of update");
	}

	/**
	 * Returns a promise that resolves when all changes known to the Host have been reflected in the Guest,
	 * or undefined if all such changes have already been reflected on the Guest.
	 *
	 * If new changes are received while a promise is already in progress,
	 * the existing promise will only resolve once all Guest-bound changes (including the new ones) have been reflected in the Guest.
	 * This means that there's no need to call this function again after receiving new changes if the previous promise is still pending.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		return this.updateInProgress?.promise;
	}
}

class Guest<const TSchema extends ImplicitFieldSchema> {
	/** The independent view on the Guest. */
	public readonly view: TreeViewAlpha<TSchema>;
	/** The number of local changes that have been made in the Guest but not yet reflected on the Host. */
	private inFlight: number = 0;
	/**
	 * The promise and resolver for the process of sending changes to the Host.
	 * When defined, the Host has not yet acknowledged the Guest changes.
	 * The promise resolves when the Host acknowledges the Guest changes.
	 * When undefined, the Host is up-to-date with the Guest.
	 */
	private pushInProgress?: PromiseWithResolver;
	/**
	 * Callback to unsubscribe from view changes.
	 */
	private readonly offViewChanged: () => void;
	/**
	 * True when the Guest is applying changes from the Host.
	 */
	private isApplyingChangesFromHost: boolean = false;

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		/** The callback to send changes from to the Host. */
		sendChangeToHost: (change: JsonCompatibleReadOnly) => void,
		/** The callback to send acknowledgements of changes received from the Host. */
		private readonly ackChangeFromHost: () => void,
		private readonly logger: (message: string) => void = () => {},
	) {
		this.view = independentInitializedView(config, options, content);
		this.offViewChanged = this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal && !this.isApplyingChangesFromHost) {
				const newChange = metadata.getChange();
				this.logger(
					`Guest: new change [${getRevision(newChange)}] (inFlight:${this.inFlight}->${this.inFlight + 1})`,
				);
				if (this.pushInProgress === undefined) {
					this.logger("Guest:   no pre-existing push in progress. Creating new push promise.");
					this.pushInProgress = makePromiseWithResolver();
				} else {
					this.logger("Guest:   Reusing existing push promise.");
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
	 * Attempts to apply a change from the Host.
	 * The change is ignored if there are local changes that have not yet been reflected on the Host.
	 * The `ackChangeFromHost` callback will be invoked iff the update is applied.
	 * @param change - The change to apply.
	 */
	public receiveChangeFromHost(change: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			// There are local changes that have not yet been reflected on the Host,
			// so this change is not applicable to the current state of the Guest.
			// We ignore it (another will come once the Host has caught up to the Guest).
			this.logger(`Guest: ignoring update from Host (inFlight=${this.inFlight})`);
			return;
		}
		this.isApplyingChangesFromHost = true;
		this.view.applyChange(change);
		this.isApplyingChangesFromHost = false;
		this.logger("Guest: applied update from Host");
		this.ackChangeFromHost();
	}

	/**
	 * Must be called when the Host acknowledges a new local change.
	 */
	public receiveAckFromHost(): void {
		assert(this.inFlight > 0, "Unexpectedly received ack from Host");
		this.logger(`Guest: local change acked (inFlight:${this.inFlight}->${this.inFlight - 1})`);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			// The Host has now caught up with all local changes
			assert(
				this.pushInProgress !== undefined,
				"Missing push promise despite in-flight changes",
			);
			const resolver = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			this.logger(`Guest:   all my changes were acked. Resolving push promise.`);
			resolver();
		}
	}

	/**
	 * Returns a promise that resolves when all changes made on the Guest have been acknowledged by the Host.
	 * Undefined if there are no such changes in flight.
	 *
	 * If new local changes are made while a promise is already in progress,
	 * the existing promise will only resolve once all local changes (including the new ones) have been reflected on the Host.
	 * This means that there's no need to call this function again after making new local changes if the previous promise is still pending.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}
}

describe("Host and Guest Demo", () => {
	/**
	 * The set of functions that are used to emulate communications between the Host and Guest.
	 */
	interface InteropFunctions {
		readonly sendChangeFromHostToGuest: (update: JsonCompatibleReadOnly) => void;
		readonly sendChangeFromGuestToHost: (change: JsonCompatibleReadOnly) => void;
		readonly sendAckOfHostBoundChangeFromHostToGuest: () => void;
		readonly sendAckOfGuestBoundChangeFromGuestToHost: () => void;
	}

	/**
	 * A function that builds interop functions given getters for the Host and Guest.
	 */
	type InteropFunctionsBuilder<T extends InteropFunctions> = (
		getHost: () => Host<typeof StringArray>,
		getGuest: () => Guest<typeof StringArray>,
	) => T;

	/**
	 * Builds interop functions that use setTimeout to simulate async communication between the Host and Guest.
	 * @param getHost - A function that returns the Host. Used to avoid circular dependencies when building the interop functions.
	 * @param getGuest - A function that returns the Guest. Used to avoid circular dependencies when building the interop functions.
	 * @returns An object containing the interop functions.
	 */
	function buildTimeoutInterop(
		getHost: () => Host<typeof StringArray>,
		getGuest: () => Guest<typeof StringArray>,
	): InteropFunctions {
		return {
			sendChangeFromHostToGuest: (update: JsonCompatibleReadOnly): void => {
				setTimeout(() => getGuest().receiveChangeFromHost(update));
			},
			sendChangeFromGuestToHost: (change: JsonCompatibleReadOnly): void => {
				setTimeout(() => getHost().receiveChangeFromGuest(change));
			},
			sendAckOfHostBoundChangeFromHostToGuest: (): void => {
				setTimeout(() => getGuest().receiveAckFromHost());
			},
			sendAckOfGuestBoundChangeFromGuestToHost: (): void => {
				setTimeout(() => getHost().receiveAckFromGuest());
			},
		};
	}

	/**
	 * Sets up a Host, Guest, and peer with the given initial state and timeout-based interop functions.
	 * @param initialState - The initial state of the shared tree.
	 * @returns An object containing the Host, Guest, peer, and interop functions.
	 */
	function setup(initialState: string[]) {
		return setupCustom(initialState, buildTimeoutInterop);
	}

	/**
	 * Sets up a Host, Guest, and peer with the given initial state and custom interop functions.
	 * @param initialState - The initial state of the shared tree.
	 * @param interopBuilder - A function that builds the interop functions.
	 * @param logging - Whether to enable logging.
	 * @returns An object containing the Host, Guest, peer, and interop functions.
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
		let guest: Guest<typeof StringArray>;
		// eslint-disable-next-line prefer-const -- it is assigned below
		let host: Host<typeof StringArray>;

		const interop = interopBuilder(
			() => host ?? fail("Interop function called before Host was initialized"),
			() => guest ?? fail("Interop function called before Guest was initialized"),
		);

		host = new Host(
			main,
			interop.sendChangeFromHostToGuest,
			interop.sendAckOfHostBoundChangeFromHostToGuest,
			logger,
		);

		const hostCompressor = provider.getCompressor(provider.trees[1]);
		const startingState = TreeAlpha.exportCompressed(host.local.root, {
			// TODO: shard the compressor here?
			idCompressor: hostCompressor,
			minVersionForCollab: FluidClientVersion.v2_80,
		});

		guest = new Guest(
			config,
			{ jsonValidator: FormatValidatorBasic },
			{
				tree: startingState,
				schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
				// TODO: shard the compressor here?
				idCompressor: hostCompressor,
			},
			interop.sendChangeFromGuestToHost,
			interop.sendAckOfGuestBoundChangeFromGuestToHost,
			logger,
		);

		const teardown = () => {
			guest.dispose();
			host.dispose();
		};

		return { teardown, peer, host, guest, provider, interop, logger };
	}

	it("the initial state is consistent across the Host and Guest", async () => {
		const { host, guest } = setup(["A"]);
		strict.deepEqual([...guest.view.root], ["A"]);
		strict.deepEqual([...host.local.root], ["A"]);
		strict.deepEqual([...host.main.root], ["A"]);
	});

	it("one Guest edit", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit in the Guest
		guest.view.root.push("B(g)");
		// The edit is synchronously reflected in the Guest
		strict.deepEqual([...guest.view.root], ["B(g)"]);
		// The edit is not reflected in the Host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The Guest should have started the process of pushing the edit to the Host
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		// Wait for the edit to be pushed to the Host
		await pushPromise;

		// The edit is now reflected in the Host
		strict.deepEqual([...host.local.root], ["B(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)"]);
		// The edit is not reflected in the peer yet
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();

		// The edit is now reflected in the peer
		strict.deepEqual([...peer.root], ["B(g)"]);
	});

	it("new Guest edits during Guest edit push", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit in the Guest
		guest.view.root.push("B(g)");
		// The edit is synchronously reflected in the Guest
		strict.deepEqual([...guest.view.root], ["B(g)"]);
		// The edit is not reflected in the Host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The Guest should have started the process of pushing the edit to the Host
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");

		// Before the push completes, other edits are made in the Guest
		guest.view.root.push("C(g)");
		guest.view.root.push("D(g)");

		// The new edits are synchronously reflected in the Guest
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)", "D(g)"]);
		// The new edits are not reflected in the Host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		await pushPromise;

		// The edits are now reflected in the Host
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)", "D(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)", "C(g)", "D(g)"]);
		// The edits are not reflected in the peer yet
		strict.deepEqual([...peer.root], []);

		provider.synchronizeMessages();

		// The edits are now reflected in the peer
		strict.deepEqual([...peer.root], ["B(g)", "C(g)", "D(g)"]);
	});

	it("one peer edit", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit on the peer
		peer.root.push("B(p)");
		// The edit is synchronously reflected in the peer
		strict.deepEqual([...peer.root], ["B(p)"]);
		// The edit is not reflected in the Host or the Guest yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);
		strict.deepEqual([...guest.view.root], []);

		provider.synchronizeMessages();

		// The edit is now reflected in the Host but not the local or Guest yet
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");
		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["B(p)"]);
		strict.deepEqual([...guest.view.root], ["B(p)"]);
	});

	it("new peer edits during Guest update", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Edit on the peer
		peer.root.push("B(p)");
		provider.synchronizeMessages();
		// The new peer edit is reflected in the Host but not the local or Guest yet.
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		// Before the update is applied to the Guest, other edits come in from the peer
		peer.root.push("C(p)");
		peer.root.push("D(p)");
		provider.synchronizeMessages();
		// The new peer edits are reflected in the Host but not the local or Guest yet.
		strict.deepEqual([...host.main.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		await updatePromise;

		// Once the promise resolves, all the peer edits should be reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["B(p)", "C(p)", "D(p)"]);
		strict.deepEqual([...guest.view.root], ["B(p)", "C(p)", "D(p)"]);
	});

	it("attempts by the Host and Guest to concurrently notify one-another of concurrent edits do not lead to inconsistencies or dropped edits", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Make edits in the Guest
		guest.view.root.push("B(g)");
		guest.view.root.push("C(g)");
		// The Guest edits are synchronously reflected in the Guest
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)"]);
		// The Guest edits are not reflected in the Host yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...host.main.root], []);

		// The Guest should have started the process of pushing the edit to the Host
		const pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");

		// Before the Host has a chance to process the edits from the Guest, the peer makes an edit
		peer.root.push("B(p)");
		strict.deepEqual([...peer.root], ["B(p)"]);
		provider.synchronizeMessages();
		// The peer edit is now reflected in the Host but not the local or Guest yet
		strict.deepEqual([...host.main.root], ["B(p)"]);
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)"]);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		// Wait for the Guest edits to be pushed to the Host
		await pushPromise;

		// The Guest edits are now reflected in the Host
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)"]);
		strict.deepEqual([...host.main.root], ["B(g)", "C(g)", "B(p)"]);
		// The Guest edits are not reflected in the peer yet
		strict.deepEqual([...peer.root], ["B(p)"]);

		provider.synchronizeMessages();

		// The Guest edits are now reflected in the peer
		strict.deepEqual([...peer.root], ["B(g)", "C(g)", "B(p)"]);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["B(g)", "C(g)", "B(p)"]);
		strict.deepEqual([...guest.view.root], ["B(g)", "C(g)", "B(p)"]);
	});

	it("Host edits sequenced before peer edits", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Make an edit on the Host
		host.main.root.push("H");
		strict.deepEqual([...host.main.root], ["H"]);

		// The Guest edits are not reflected in the Guest or peer yet
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);
		strict.deepEqual([...peer.root], []);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		// Before the Guest has a chance to process the edits from the Host, the peer makes an edit
		peer.root.push("P");
		strict.deepEqual([...peer.root], ["P"]);

		provider.synchronizeMessages();
		// The peer and Host edits are sequenced
		strict.deepEqual([...host.main.root], ["P", "H"]);
		strict.deepEqual([...peer.root], ["P", "H"]);

		// The Guest is still in the process of updating
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["P", "H"]);
		strict.deepEqual([...guest.view.root], ["P", "H"]);
	});

	it("peer edits sequenced before Host edits", async () => {
		const { peer, host, guest, provider } = setup([]);

		// Make an edit on the peer
		peer.root.push("P");
		strict.deepEqual([...peer.root], ["P"]);

		// Make an edit on the Host
		host.main.root.push("H");
		strict.deepEqual([...host.main.root], ["H"]);

		// The Host should have started the process of updating the Guest with the peer change
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");

		provider.synchronizeMessages();

		// The peer and Host edits are sequenced
		strict.deepEqual([...host.main.root], ["H", "P"]);
		strict.deepEqual([...peer.root], ["H", "P"]);

		// The Guest is still in the process of updating
		strict.deepEqual([...host.local.root], []);
		strict.deepEqual([...guest.view.root], []);

		// Wait for the update to be applied to the Guest
		await updatePromise;

		// The peer edit is now reflected in the local and Guest
		strict.deepEqual([...host.local.root], ["H", "P"]);
		strict.deepEqual([...guest.view.root], ["H", "P"]);
	});

	it("Guest edits can be reverted", async () => {
		const { host, guest } = setup([]);
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
			guest.view.events,
		);

		// Make undoable edits in the Guest
		guest.view.root.push("Ga");
		guest.view.root.push("Gb");
		guest.view.root.push("Gc");
		strict.deepEqual([...guest.view.root], ["Ga", "Gb", "Gc"]);
		strict.deepEqual(undoStack.length, 3, "Expected undo stack to have 3 entries");

		// The Guest should have started the process of pushing the edit to the Host
		let pushPromise =
			guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...guest.view.root], ["Ga", "Gb", "Gc"]);
		strict.deepEqual([...host.local.root], ["Ga", "Gb", "Gc"]);
		strict.deepEqual([...host.main.root], ["Ga", "Gb", "Gc"]);

		// Make an edit on the Host
		host.main.root.insertAtStart("H");
		strict.deepEqual([...host.main.root], ["H", "Ga", "Gb", "Gc"]);

		// Wait for the update to be applied to the Guest
		const updatePromise =
			host.updateGuestPromise ?? strict.fail("Expected update to be in progress");
		await updatePromise;

		strict.deepEqual([...host.local.root], ["H", "Ga", "Gb", "Gc"]);
		strict.deepEqual([...guest.view.root], ["H", "Ga", "Gb", "Gc"]);

		strict.deepEqual(
			undoStack.length,
			4,
			"Expected Host change to add an entry to the undo stack",
		);
		undoStack.pop()?.dispose();

		// Undo the Guest edits
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();
		undoStack.pop()?.revert();

		// The Guest should have started the process of pushing the edits to the Host
		pushPromise = guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...guest.view.root], ["H"]);
		strict.deepEqual([...host.local.root], ["H"]);
		strict.deepEqual([...host.main.root], ["H"]);
		assert(redoStack.length === 3, "Expected redo stack to have 3 entries");

		// Undo the Guest edits
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();
		redoStack.pop()?.revert();

		// The Guest should have started the process of pushing the edits to the Host
		pushPromise = guest.updateHostPromise ?? strict.fail("Expected push to be in progress");
		await pushPromise;

		strict.deepEqual([...host.local.root], ["H", "Ga", "Gb", "Gc"]);
		strict.deepEqual([...guest.view.root], ["H", "Ga", "Gb", "Gc"]);
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
			/** Make an edit on the Host */
			HostEdit = "He",
			/** Make an edit on the Guest */
			GuestEdit = "Ge",
			/** Make an edit on the peer */
			PeerEdit = "Pe",
			/** Make the Host receive a sequenced edit from the peer */
			SequenceEdit = "Se",
			/** Make the Host receive its own sequenced edit */
			SequenceAck = "Sa",
			/** Notify the Guest of an update sent by the Host. */
			HostToGuestEdit = "H2Ge",
			/** Notify the Host of a Guest-bound update ack sent by the Guest. */
			GuestToHostAck = "G2Ha",
			/** Notify the Host of an edit sent by the Guest. */
			GuestToHostEdit = "G2He",
			/** Notify the Guest of a Host-bound edit ack sent by the Host. */
			HostToGuestAck = "H2Ga",
		}

		type Ack = "Ack";
		const Ack: Ack = "Ack";
		type Message = JsonCompatibleReadOnly | Ack;
		interface QueueInteropFunctions extends InteropFunctions {
			readonly hostToGuest: Message[];
			readonly guestToHost: Message[];

			dispatchToGuest(): void;
			dispatchToHost(): void;
		}

		/**
		 * Generates a set of interop functions that keep messages in queues,
		 * making it possible to control which queue progresses and when.
		 * @param getHost - A function that returns the Host instance.
		 * @param getGuest - A function that returns the Guest instance.
		 * @returns An object containing the queued interop functions.
		 */
		function buildQueueInterop(
			getHost: () => Host<typeof StringArray>,
			getGuest: () => Guest<typeof StringArray>,
		): QueueInteropFunctions {
			const out: QueueInteropFunctions = {
				hostToGuest: [],
				guestToHost: [],
				sendChangeFromHostToGuest: (update: JsonCompatibleReadOnly): void => {
					out.hostToGuest.push(update);
				},
				dispatchToGuest: (): void => {
					const message =
						out.hostToGuest.shift() ?? fail("No Guest-bound changes in the queue");
					if (message === Ack) {
						getGuest().receiveAckFromHost();
					} else {
						getGuest().receiveChangeFromHost(message);
					}
				},
				sendAckOfGuestBoundChangeFromGuestToHost: (): void => {
					out.guestToHost.push(Ack);
				},
				sendChangeFromGuestToHost: (change: JsonCompatibleReadOnly): void => {
					out.guestToHost.push(change);
				},
				dispatchToHost: (): void => {
					const message = out.guestToHost.shift() ?? fail("No Host-bound changes in queue");
					if (message === Ack) {
						getHost().receiveAckFromGuest();
					} else {
						getHost().receiveChangeFromGuest(message);
					}
				},
				sendAckOfHostBoundChangeFromHostToGuest: (): void => {
					out.hostToGuest.push(Ack);
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
		 * E.g., `[[Step.GuestEdit], [Step.GuestEdit], [Step.GuestToHostEdit], [Step.SequenceAck], [Step.GuestToHostEdit], [Step.SequenceAck]]`.
		 */
		const potential: Step[][] = [[Step.GuestEdit, Step.HostEdit, Step.PeerEdit]];
		while (hasSome(potential)) {
			scenario += 1;
			const { teardown, peer, host, guest, provider, interop, logger } = setupCustom(
				[],
				buildQueueInterop,
				false,
			);
			let peerEditCounter = 0;
			let hostEditCounter = 0;
			let guestEditCounter = 0;
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
					const potentialNext: Step[] = [Step.GuestEdit, Step.HostEdit, Step.PeerEdit];
					if (hasSome(serviceQueue)) {
						potentialNext.push(serviceQueue[0]);
					}
					if (hasSome(interop.hostToGuest)) {
						potentialNext.push(
							interop.hostToGuest[0] === Ack
								? Step.HostToGuestAck
								: Step.HostToGuestEdit,
						);
					}
					if (hasSome(interop.guestToHost)) {
						potentialNext.push(
							interop.guestToHost[0] === Ack
								? Step.GuestToHostAck
								: Step.GuestToHostEdit,
						);
					}
					potential.push(potentialNext);
				}
				const step: Step = potential[actual.length][0] ?? fail("No next step available");
				logger(`--> [${actual.join(", ")}] + ${step}`);
				switch (step) {
					case Step.GuestEdit: {
						guestEditCounter += 1;
						guest.view.root.push(`G${guestEditCounter}`);
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
					case Step.HostToGuestEdit:
					case Step.HostToGuestAck: {
						interop.dispatchToGuest();
						break;
					}
					case Step.GuestToHostEdit:
					case Step.GuestToHostAck: {
						interop.dispatchToHost();
						break;
					}
					default: {
						throw new Error(`Unexpected step: ${step}`);
					}
				}
				actual.push(step);
				if (interop.hostToGuest.length === 0 && interop.guestToHost.length === 0) {
					strict.deepEqual([...host.main.root], [...guest.view.root]);
					strict.deepEqual([...host.local.root], [...guest.view.root]);
				}

				if (host.updateGuestPromise === undefined) {
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
