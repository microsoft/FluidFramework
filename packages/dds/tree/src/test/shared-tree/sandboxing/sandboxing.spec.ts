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
	// eslint-disable-next-line import-x/no-internal-modules -- The test requires internal Simple Tree APIs.
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

/**
 * A serialized SharedTree change that one participant sends to the other participant.
 */
interface DataChangeMessage {
	/** Identifies this message as a data-change message. */
	readonly type: "dataChange";
	/** The serialized SharedTree change to apply. */
	readonly change: JsonCompatibleReadOnly;
}

/**
 * Confirms that the receiver applied one data-change message.
 */
interface AcknowledgmentMessage {
	/** Identifies this message as an acknowledgment message. */
	readonly type: "acknowledgment";
}

/** A message that the Host and the Guest can send through their shared protocol. */
type HostGuestMessage = DataChangeMessage | AcknowledgmentMessage;

/**
 * Validates data from a Host and Guest message channel.
 *
 * @param data - The message data to validate.
 * @returns The validated protocol message.
 * @throws An error if the data is not a valid protocol message envelope.
 */
function parseHostGuestMessage(data: unknown): HostGuestMessage {
	if (typeof data !== "object" || data === null || !("type" in data)) {
		throw new Error("Invalid Host and Guest protocol message.");
	}

	if (data.type === "acknowledgment") {
		return data as AcknowledgmentMessage;
	}

	if (data.type === "dataChange" && "change" in data) {
		return data as DataChangeMessage;
	}

	throw new Error("Invalid Host and Guest protocol message.");
}

/** A promise and the function that resolves it. */
interface PromiseWithResolver {
	/** The synchronization operation that a caller can await. */
	readonly promise: Promise<void>;
	/** Resolves the synchronization operation. */
	readonly resolver: () => void;
}

/**
 * Creates a promise and the function that resolves it.
 *
 * @returns The promise and its resolver.
 */
function makePromiseWithResolver(): PromiseWithResolver {
	let resolver: undefined | (() => void);
	const promise = new Promise<void>((resolve) => {
		resolver = resolve;
	});
	assert(resolver !== undefined, "Resolve function should have been assigned");
	return { promise, resolver };
}

/**
 * Implements the default protocol-error behavior.
 *
 * @param error - The protocol error to throw.
 * @throws The specified protocol error.
 */
function throwProtocolError(error: Error): never {
	throw error;
}

/**
 * Converts a thrown value to an error that the protocol-error handler can process.
 *
 * @param error - The value that message processing threw.
 * @returns The original error, or a new error that has the thrown value as its cause.
 */
function normalizeProtocolError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error("Host and Guest protocol processing failed.", { cause: error });
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
	/** Indicates whether this Host released its resources. */
	private disposed: boolean = false;

	/** Receives and routes protocol messages from the Guest. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		if (this.disposed) {
			this.handleProtocolError(new Error("The Host received a message after disposal."));
			return;
		}

		try {
			const message = parseHostGuestMessage(event.data);
			switch (message.type) {
				case "dataChange": {
					this.receiveChangeFromGuest(message.change);
					break;
				}
				case "acknowledgment": {
					this.receiveAckFromGuest();
					break;
				}
				default: {
					fail("Unexpected Host and Guest message type");
				}
			}
		} catch (error) {
			this.handleProtocolError(normalizeProtocolError(error));
		}
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.handleProtocolError(new Error("The Host could not deserialize a protocol message."));
	};

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The Host endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** Receives errors from protocol validation and message processing. */
		private readonly handleProtocolError: (error: Error) => void = throwProtocolError,
		/** Receives diagnostic messages from the synchronization algorithm. */
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
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;

		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.port.close();
		this.updateInProgress = undefined;
		this.offMainChanged();
		this.mainHeadFromLastUpdate?.dispose();
		this.mainHeadFromLastUpdate = undefined;
		this.local.dispose();
		this.main.dispose();
	}

	/**
	 * Informs the Host of a new change made on the Guest.
	 * This method synchronously applies the change to the Host's local and main branches
	 * then asynchronously attempts to update the Guest if need be.
	 */
	private receiveChangeFromGuest(change: JsonCompatibleReadOnly): void {
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
		try {
			this.main.merge(this.local, false);
		} finally {
			this.isApplyingGuestChanges = false;
		}
		this.port.postMessage({ type: "acknowledgment" } satisfies AcknowledgmentMessage);
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
			this.port.postMessage({
				type: "dataChange",
				change: update,
			} satisfies DataChangeMessage);
		} else {
			this.logger("Host:   no changes that need to be reflected in Guest");
			// The Guest is now caught up with the Host's main branch
			if (this.updateInProgress !== undefined) {
				this.logger("Host:   resolving update promise");
				const resolve = this.updateInProgress.resolver;
				this.updateInProgress = undefined;
				resolve();
			}
		}
	}

	/**
	 * Informs the Host that the Guest has acknowledged a change that the Host has sent.
	 * This allows the Host to reflect the acknowledged change on the local branch.
	 * This may also trigger the Host to send new changes to the Guest if the Guest is currently behind the Host's main branch.
	 */
	private receiveAckFromGuest(): void {
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
	/** Indicates whether this Guest released its resources. */
	private disposed: boolean = false;

	/** Receives and routes protocol messages from the Host. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		if (this.disposed) {
			this.handleProtocolError(new Error("The Guest received a message after disposal."));
			return;
		}

		try {
			const message = parseHostGuestMessage(event.data);
			switch (message.type) {
				case "dataChange": {
					this.receiveChangeFromHost(message.change);
					break;
				}
				case "acknowledgment": {
					this.receiveAckFromHost();
					break;
				}
				default: {
					fail("Unexpected Host and Guest message type");
				}
			}
		} catch (error) {
			this.handleProtocolError(normalizeProtocolError(error));
		}
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.handleProtocolError(new Error("The Guest could not deserialize a protocol message."));
	};

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		/** The Guest endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** Receives errors from protocol validation and message processing. */
		private readonly handleProtocolError: (error: Error) => void = throwProtocolError,
		/** Receives diagnostic messages from the synchronization algorithm. */
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
				this.port.postMessage({
					type: "dataChange",
					change: newChange,
				} satisfies DataChangeMessage);
			}
		});
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.port.close();
		this.pushInProgress = undefined;
		this.offViewChanged();
		this.view.dispose();
	}

	/**
	 * Attempts to apply a change from the Host.
	 * The change is ignored if there are local changes that have not yet been reflected on the Host.
	 * The `ackChangeFromHost` callback will be invoked iff the update is applied.
	 * @param change - The change to apply.
	 */
	private receiveChangeFromHost(change: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			// There are local changes that have not yet been reflected on the Host,
			// so this change is not applicable to the current state of the Guest.
			// We ignore it (another will come once the Host has caught up to the Guest).
			this.logger(`Guest: ignoring update from Host (inFlight=${this.inFlight})`);
			return;
		}
		this.isApplyingChangesFromHost = true;
		try {
			this.view.applyChange(change);
		} finally {
			this.isApplyingChangesFromHost = false;
		}
		this.logger("Guest: applied update from Host");
		this.port.postMessage({ type: "acknowledgment" } satisfies AcknowledgmentMessage);
	}

	/**
	 * Must be called when the Host acknowledges a new local change.
	 */
	private receiveAckFromHost(): void {
		assert(this.inFlight > 0, "Unexpectedly received ack from Host");
		this.logger(`Guest: local change acked (inFlight:${this.inFlight}->${this.inFlight - 1})`);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			// The Host has now caught up with all local changes
			assert(
				this.pushInProgress !== undefined,
				"Missing push promise despite in-flight changes",
			);
			const resolve = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			this.logger(`Guest:   all my changes were acked. Resolving push promise.`);
			resolve();
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

describe("Host and Guest message protocol", () => {
	it("accepts data changes and acknowledgments", () => {
		const dataChange: DataChangeMessage = { type: "dataChange", change: { value: 1 } };
		const acknowledgment: AcknowledgmentMessage = { type: "acknowledgment" };

		strict.equal(parseHostGuestMessage(dataChange), dataChange);
		strict.equal(parseHostGuestMessage(acknowledgment), acknowledgment);
	});

	it("rejects invalid message envelopes", () => {
		const invalidMessages: unknown[] = [
			null,
			"dataChange",
			{},
			{ type: "unknown" },
			{ type: "dataChange" },
		];

		for (const message of invalidMessages) {
			strict.throws(
				() => parseHostGuestMessage(message),
				/Invalid Host and Guest protocol message/,
			);
		}
	});
});

describe("Host and Guest Demo", () => {
	/**
	 * The ports and test controls for one Host and Guest session.
	 */
	interface SessionPorts<TInterop> {
		/** The port that the Host owns. */
		readonly hostPort: MessagePort;
		/** The port that the Guest owns. */
		readonly guestPort: MessagePort;
		/** The controls that the test uses to manage message delivery. */
		readonly interop: TInterop;
		/** Releases transport resources that the Host and the Guest do not own. */
		dispose(): void;
	}

	/** A function that builds the ports and test controls for one session. */
	type SessionPortsBuilder<TInterop> = () => SessionPorts<TInterop>;

	/**
	 * Builds a direct channel between the Host and the Guest.
	 */
	function buildDirectSessionPorts(): SessionPorts<undefined> {
		const channel = new MessageChannel();
		return {
			hostPort: channel.port1,
			guestPort: channel.port2,
			interop: undefined,
			dispose: () => {},
		};
	}

	/** Ports that let a test send messages to each participant independently. */
	interface IsolatedPortControls {
		/** Sends a test message to the Host. */
		readonly sendToHost: MessagePort;
		/** Sends a test message to the Guest. */
		readonly sendToGuest: MessagePort;
	}

	/**
	 * Builds separate channels that let a test send messages to each participant.
	 */
	function buildIsolatedSessionPorts(): SessionPorts<IsolatedPortControls> {
		const hostChannel = new MessageChannel();
		const guestChannel = new MessageChannel();
		return {
			hostPort: hostChannel.port1,
			guestPort: guestChannel.port1,
			interop: {
				sendToHost: hostChannel.port2,
				sendToGuest: guestChannel.port2,
			},
			dispose: () => {
				hostChannel.port2.close();
				guestChannel.port2.close();
			},
		};
	}

	const activeTeardowns = new Set<() => void>();

	afterEach(() => {
		for (const teardown of [...activeTeardowns]) {
			teardown();
		}
	});

	/**
	 * Sets up a Host, Guest, and peer with the given initial state and a direct message channel.
	 * @param initialState - The initial state of the shared tree.
	 * @returns The session components and teardown function.
	 */
	function setup(initialState: string[]) {
		return setupCustom(initialState, buildDirectSessionPorts);
	}

	/**
	 * Sets up a Host, Guest, and peer with the given initial state and session ports.
	 * @param initialState - The initial state of the shared tree.
	 * @param sessionPortsBuilder - A function that builds the ports and test controls.
	 * @param logging - Whether to enable logging.
	 * @param handleProtocolError - A function that handles protocol errors.
	 * @returns The session components and test controls.
	 */
	function setupCustom<TInterop>(
		initialState: string[],
		sessionPortsBuilder: SessionPortsBuilder<TInterop>,
		logging: boolean = false,
		handleProtocolError: (error: Error) => void = throwProtocolError,
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
		const sessionPorts = sessionPortsBuilder();
		const host = new Host(main, sessionPorts.hostPort, handleProtocolError, logger);

		const hostCompressor = provider.getCompressor(provider.trees[1]);
		const startingState = TreeAlpha.exportCompressed(host.local.root, {
			// TODO: shard the compressor here?
			idCompressor: hostCompressor,
			minVersionForCollab: FluidClientVersion.v2_80,
		});

		const guest = new Guest(
			config,
			{ jsonValidator: FormatValidatorBasic },
			{
				tree: startingState,
				schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
				// TODO: shard the compressor here?
				idCompressor: hostCompressor,
			},
			sessionPorts.guestPort,
			handleProtocolError,
			logger,
		);

		const teardown = () => {
			if (!activeTeardowns.delete(teardown)) {
				return;
			}
			guest.dispose();
			host.dispose();
			sessionPorts.dispose();
		};
		activeTeardowns.add(teardown);

		return {
			teardown,
			peer,
			host,
			guest,
			provider,
			interop: sessionPorts.interop,
			logger,
		};
	}

	it("uses structured clones for protocol messages", async () => {
		const channel = new MessageChannel();
		const change = { revision: "test revision" };
		const message: DataChangeMessage = { type: "dataChange", change };
		const received = new Promise<HostGuestMessage>((resolve) => {
			channel.port2.addEventListener(
				"message",
				(event: MessageEvent<unknown>) => resolve(parseHostGuestMessage(event.data)),
				{ once: true },
			);
			channel.port2.start();
		});

		channel.port1.postMessage(message);
		const receivedMessage = await received;

		strict.deepEqual(receivedMessage, message);
		strict.notEqual(receivedMessage, message);
		if (receivedMessage.type === "dataChange") {
			strict.notEqual(receivedMessage.change, change);
		}
		channel.port1.close();
		channel.port2.close();
	});

	it("routes invalid messages to the protocol-error handler", async () => {
		let reportProtocolError: ((error: Error) => void) | undefined;
		const protocolError = new Promise<Error>((resolve) => {
			reportProtocolError = resolve;
		});
		assert(reportProtocolError !== undefined, "Protocol error reporter should be assigned");
		const { interop } = setupCustom([], buildIsolatedSessionPorts, false, reportProtocolError);

		interop.sendToHost.postMessage({ type: "unknown" });

		const error = await protocolError;
		strict.match(error.message, /Invalid Host and Guest protocol message/);
	});

	it("does not acknowledge an invalid SharedTree change", async () => {
		let reportProtocolError: ((error: Error) => void) | undefined;
		const protocolError = new Promise<Error>((resolve) => {
			reportProtocolError = resolve;
		});
		assert(reportProtocolError !== undefined, "Protocol error reporter should be assigned");
		const channel = new MessageChannel();
		const local = {
			applyChange: () => {
				throw new Error("Cannot apply change. Invalid serialized change format.");
			},
			dispose: () => {},
		} as unknown as TreeViewAlpha<typeof StringArray>;
		const main = {
			fork: () => local,
			events: { on: () => () => {} },
			dispose: () => {},
		} as unknown as TreeViewAlpha<typeof StringArray>;
		const host = new Host(main, channel.port1, reportProtocolError);
		let acknowledgmentReceived = false;
		channel.port2.addEventListener("message", () => {
			acknowledgmentReceived = true;
		});
		channel.port2.start();

		channel.port2.postMessage({ type: "dataChange", change: {} });
		await protocolError;
		await new Promise((resolve) => setTimeout(resolve, 0));

		strict.equal(acknowledgmentReceived, false);
		host.dispose();
		channel.port2.close();
	});

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
		const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(guest.view.events);

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
	it("All permutations", async function () {
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

		/** Controls queued message delivery between the Host and the Guest. */
		interface MessageRelay {
			/** Messages that the Host sent and the relay has not sent to the Guest. */
			readonly hostToGuest: HostGuestMessage[];
			/** Messages that the Guest sent and the relay has not sent to the Host. */
			readonly guestToHost: HostGuestMessage[];

			/** Sends the first queued Host message to the Guest. */
			dispatchToGuest(): void;
			/** Sends the first queued Guest message to the Host. */
			dispatchToHost(): void;
			/** Waits until all dispatched messages reach a relay queue or participant. */
			waitForMessages(): Promise<void>;
		}

		/**
		 * Builds a two-channel relay that controls message delivery.
		 * @returns The session ports and relay controls.
		 */
		function buildMessageRelay(): SessionPorts<MessageRelay> {
			const hostChannel = new MessageChannel();
			const guestChannel = new MessageChannel();
			const hostRelayPort = hostChannel.port2;
			const guestRelayPort = guestChannel.port1;
			/** The number of messages that participants sent but the relay has not received. */
			let messagesMovingToRelay = 0;
			/** The number of messages that the relay sent but participants have not processed. */
			let messagesMovingToParticipants = 0;
			/** Functions that resolve calls to `waitForMessages()`. */
			const settledResolvers: (() => void)[] = [];

			/** Resolves each waiter when no message is moving through a channel. */
			const resolveIfSettled = (): void => {
				if (messagesMovingToRelay === 0 && messagesMovingToParticipants === 0) {
					for (const resolve of settledResolvers.splice(0)) {
						resolve();
					}
				}
			};

			/**
			 * Tracks messages that move between a participant and its relay endpoint.
			 */
			class TrackedParticipantPort extends EventTarget {
				public constructor(
					/** The MessagePort that carries messages across the structured-clone boundary. */
					private readonly innerPort: MessagePort,
				) {
					super();
					this.innerPort.addEventListener("message", (event: MessageEvent<unknown>) => {
						try {
							this.dispatchEvent(new MessageEvent("message", { data: event.data }));
						} finally {
							messagesMovingToParticipants -= 1;
							resolveIfSettled();
						}
					});
					this.innerPort.addEventListener("messageerror", () => {
						try {
							this.dispatchEvent(new MessageEvent("messageerror"));
						} finally {
							messagesMovingToParticipants -= 1;
							resolveIfSettled();
						}
					});
				}

				/**
				 * Sends a message to the relay and tracks its delivery.
				 *
				 * @param message - The message to send.
				 * @param transferOrOptions - Transferable objects or structured-clone options.
				 */
				public postMessage(
					message: unknown,
					transferOrOptions?: Transferable[] | StructuredSerializeOptions,
				): void {
					messagesMovingToRelay += 1;
					try {
						// The branches select different `MessagePort.postMessage` overloads.
						// TypeScript cannot pass the union directly because no overload accepts both types.
						if (Array.isArray(transferOrOptions)) {
							this.innerPort.postMessage(message, transferOrOptions);
						} else {
							this.innerPort.postMessage(message, transferOrOptions);
						}
					} catch (error) {
						messagesMovingToRelay -= 1;
						resolveIfSettled();
						throw error;
					}
				}

				/** Starts message delivery on the inner port. */
				public start(): void {
					this.innerPort.start();
				}

				/** Closes the inner port. */
				public close(): void {
					this.innerPort.close();
				}
			}

			const hostPort = new TrackedParticipantPort(hostChannel.port1);
			const guestPort = new TrackedParticipantPort(guestChannel.port2);

			const relay: MessageRelay = {
				hostToGuest: [],
				guestToHost: [],
				dispatchToGuest: (): void => {
					const message = relay.hostToGuest.shift() ?? fail("No Guest-bound messages");
					messagesMovingToParticipants += 1;
					try {
						guestRelayPort.postMessage(message);
					} catch (error) {
						messagesMovingToParticipants -= 1;
						resolveIfSettled();
						throw error;
					}
				},
				dispatchToHost: (): void => {
					const message = relay.guestToHost.shift() ?? fail("No Host-bound messages");
					messagesMovingToParticipants += 1;
					try {
						hostRelayPort.postMessage(message);
					} catch (error) {
						messagesMovingToParticipants -= 1;
						resolveIfSettled();
						throw error;
					}
				},
				waitForMessages: async (): Promise<void> => {
					if (messagesMovingToRelay !== 0 || messagesMovingToParticipants !== 0) {
						await new Promise<void>((resolve) => settledResolvers.push(resolve));
					}
				},
			};

			hostRelayPort.addEventListener("message", (event: MessageEvent<unknown>) => {
				try {
					relay.hostToGuest.push(parseHostGuestMessage(event.data));
				} finally {
					messagesMovingToRelay -= 1;
					resolveIfSettled();
				}
			});
			guestRelayPort.addEventListener("message", (event: MessageEvent<unknown>) => {
				try {
					relay.guestToHost.push(parseHostGuestMessage(event.data));
				} finally {
					messagesMovingToRelay -= 1;
					resolveIfSettled();
				}
			});
			hostRelayPort.start();
			guestRelayPort.start();

			return {
				hostPort: hostPort as unknown as MessagePort,
				guestPort: guestPort as unknown as MessagePort,
				interop: relay,
				dispose: () => {
					hostRelayPort.close();
					guestRelayPort.close();
				},
			};
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
				buildMessageRelay,
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
							interop.hostToGuest[0].type === "acknowledgment"
								? Step.HostToGuestAck
								: Step.HostToGuestEdit,
						);
					}
					if (hasSome(interop.guestToHost)) {
						potentialNext.push(
							interop.guestToHost[0].type === "acknowledgment"
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
				await interop.waitForMessages();
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
