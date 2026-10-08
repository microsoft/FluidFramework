/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	type IdCreationRange,
	type ParentShardSynchronizationToken,
	type ShardSynchronizationToken,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { DiscriminatedUnionDispatcher, FluidClientVersion } from "../codec/index.js";
import { castCursorToSynchronous, findAncestor, moveToDetachedField } from "../core/index.js";
import {
	defaultSchemaPolicy,
	fieldBatchCodecBuilder,
	schemaCodecBuilder,
	TreeCompressionStrategy,
} from "../feature-libraries/index.js";
import type { TreeCheckout } from "../shared-tree/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";
import { brand } from "../util/index.js";

import {
	type BlobRequestMessage,
	createBufferPlaceholder,
	type GuestChangeMessage,
	type GuestToHostMessage,
	guestToHostMessageValidator,
	type HostToGuestMessage,
	type HostIdRangeId,
	type HostInitializationMessage,
	hostToGuestMessageValidator,
	sandboxFormatValidator,
	SandboxProtocolError,
	throwProtocolError,
	validateTreePayloadVocabulary,
} from "./common.js";
import { HostTransportCodec } from "./hostTransport.js";
import { HostSynchronization } from "./hostSynchronization.js";
import type { Sandboxing } from "./sandboxing.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";
import { getCheckout, getIdCompressor } from "./synchronizationUtils.js";

/**
 * Implementation of {@link Sandboxing.Host}.
 */
export class HostImplementation implements Sandboxing.Host {
	public readonly codec: HostTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	/** Internal synchronization state exposed for testing. */
	public readonly synchronization: HostSynchronization;
	/** The checkout extracted from the application-provided view. */
	private readonly mainCheckout: TreeCheckout;

	/**
	 * The port connecting this Host to the Guest.
	 *
	 * @privateRemarks
	 * The odd typing here is intentional and important.
	 * Without it, we take an implicit dependency on DOM types, which may not be available in all environments.
	 */
	private readonly port: InstanceType<typeof MessagePort>;

	private readonly logger: TelemetryLoggerExt;
	private readonly idCompressor: ReturnType<typeof toIdCompressorWithCore>;
	/**
	 * Last accepted progress token from the Guest's ID space shard.
	 * @remarks Used to reclaim the shard after the Guest is closed.
	 */
	private guestIdSpaceShardToken: ShardSynchronizationToken | undefined;
	/** ID for the next finalized creation range sent to the Guest, starting at zero for each session. */
	private nextIdRangeId = 0;
	/**
	 * Removes the listener that forwards finalized ID ranges to the Guest.
	 * @remarks
	 * This is `undefined` if Host initialization fails before the listener is registered.
	 */
	private readonly offRangeFinalized: (() => void) | undefined;
	private disposed = false;

	private readonly messageDispatcher = new DiscriminatedUnionDispatcher<
		GuestToHostMessage,
		[],
		void
	>({
		guestChange: (message) => {
			this.synchronization.receiveChangeFromGuest(message);
		},
		hostUpdateAck: (message) => {
			this.synchronization.receiveUpdateAck(message);
		},
		blobRequest: (message) => {
			this.receiveBlobRequest(message).catch((error: unknown) => {
				this.session.fail(error);
			});
		},
		sessionFailure: (message) => {
			this.session.fail(SandboxProtocolError.fromPeerMessage(message, "Guest"), false);
		},
	});

	/** Receives and routes protocol messages from the Guest. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		this.session.run(() => {
			const normalized = this.codec.decode(event.data);
			if (!guestToHostMessageValidator.check(normalized)) {
				throw new SandboxProtocolError("Invalid Host and Guest protocol message.");
			}
			this.messageDispatcher.dispatch(normalized);
		});
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.session.fail(
			new SandboxProtocolError("The Host could not deserialize a protocol message."),
		);
	};

	public constructor({
		main,
		port,
		logger,
		handleProtocolError = throwProtocolError,
	}: Sandboxing.HostOptions) {
		this.port = port;
		this.idCompressor = toIdCompressorWithCore(getIdCompressor(main));
		this.codec = new HostTransportCodec();
		this.mainCheckout = getCheckout(main);
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				this.synchronization.stop(error);
				this.codec.dispose();
			},
			handleProtocolError,
		);
		this.logger = createChildLogger({
			logger: logger ?? this.mainCheckout.breaker.logger,
			namespace: "Host",
		});
		this.synchronization = new HostSynchronization(
			this.mainCheckout,
			(message) => this.postMessage(message),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			this.logger,
			(token) => this.synchronizeGuestIdSpaceShard(token),
			() => this.getParentIdSpaceShardSyncToken(),
		);
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
		try {
			this.postMessage({
				hostInitialization: this.createInitializationMessage(this.idCompressor),
			});
		} catch (error) {
			this.dispose();
			throw error;
		}
		this.offRangeFinalized = this.idCompressor.events.on("rangeFinalized", (range) =>
			this.session.run(() => this.sendFinalizedRange(range)),
		);
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.offRangeFinalized?.();

		try {
			this.session.dispose();
		} finally {
			// Session shutdown can fail while stopping pending work; still release the
			// branches and reclaim the shard before propagating that error.
			this.port.removeEventListener("message", this.onMessage);
			this.port.removeEventListener("messageerror", this.onMessageError);
			try {
				this.synchronization.dispose();
			} finally {
				// Branch cleanup can also fail, and must not leave the shard reserved.
				const token = this.guestIdSpaceShardToken;
				if (token !== undefined) {
					// No further Guest changes can reach this session.
					this.idCompressor.synchronizeWithShard({ ...token, disposed: true });
					this.guestIdSpaceShardToken = undefined;
				}
			}
		}
	}

	/** Terminal failure requiring application-managed Host/Guest recreation, if this session failed. */
	public get error(): Error | undefined {
		return this.session.error;
	}

	private async receiveBlobRequest(message: BlobRequestMessage): Promise<void> {
		const resolution = this.codec.resolveBlob(message.token);
		let blob: ArrayBuffer;
		try {
			blob = await resolution;
		} catch (error) {
			this.logger.sendErrorEvent({ eventName: "BlobResolutionFailed" }, error);
			if (this.session.active) {
				this.postMessage({
					blobResponseError: {
						requestId: message.requestId,
						error: "The service failed to resolve the handle.",
					},
				});
			}
			return;
		}

		if (this.session.active) {
			// Do not transfer: detaching the Host's buffer could break other consumers.
			this.postMessage({
				blobResponse: {
					requestId: message.requestId,
					blob: createBufferPlaceholder(blob),
				},
			});
		}
	}

	private postMessage(message: HostToGuestMessage): void {
		const normalized = normalizeTransportData(message);
		if (!hostToGuestMessageValidator.check(normalized)) {
			throw new SandboxProtocolError("Invalid Host and Guest protocol message.");
		}
		this.port.postMessage(this.codec.encode(normalized));
	}

	/**
	 * Adds the Guest's new IDs to the Host compressor before the Host decodes a Guest change.
	 *
	 * @remarks
	 * The message schema requires a non-disposing token and checks its wire format.
	 * This method accepts only the ID space shard created for this session.
	 * Progress cannot move backward from the last accepted token.
	 * Consecutive changes can report the same progress if they create no new IDs.
	 * The Host saves the new token only after compressor synchronization succeeds.
	 *
	 * @param token - The Guest ID space shard's progress after it encoded the change.
	 * @throws {@link SandboxProtocolError} if initialization is incomplete, the token belongs to another ID space shard, or progress moves backward.
	 */
	private synchronizeGuestIdSpaceShard(token: GuestChangeMessage["idSpaceShardToken"]): void {
		const previous = this.guestIdSpaceShardToken;
		if (previous === undefined) {
			throw new SandboxProtocolError(
				"Guest ID space shard token received before initialization.",
			);
		}
		if (token.shardId !== previous.shardId) {
			throw new SandboxProtocolError(
				"Guest ID space shard token does not belong to this session.",
			);
		}
		if (token.localGenCount < previous.localGenCount) {
			throw new SandboxProtocolError("Guest ID space shard progress moved backward.");
		}
		// Only the child created for this Host session may advance its root compressor.
		// The wire shape is validated before routing; this check authorizes its shard and progress.
		// The compressor token brand has no runtime representation.
		const authorizedToken = token as ShardSynchronizationToken;
		this.idCompressor.synchronizeWithShard(authorizedToken);
		this.guestIdSpaceShardToken = authorizedToken;
	}

	/**
	 * Gets the Host compressor's synchronization token for this Guest's ID space shard.
	 *
	 * @remarks
	 * The Host captures this token after it encodes a tree update or receives a finalized
	 * creation range. The Guest applies it before it decodes a dependent update or finalizes
	 * the range.
	 *
	 * This method does not create or submit a new creation range.
	 *
	 * @returns The parent synchronization token addressed to this Guest's ID space shard.
	 */
	private getParentIdSpaceShardSyncToken(): ParentShardSynchronizationToken {
		const child = this.guestIdSpaceShardToken;
		assert(child !== undefined, 0xd5f /* Expected an initialized Guest ID space shard */);
		return this.idCompressor.getChildShardSyncToken(child);
	}

	/**
	 * Sends an ID range after the Host runtime has finalized it.
	 *
	 * @remarks
	 * The compressor reports finalized ranges in order. This method gives each message a
	 * session-local ID and includes the current parent synchronization token. It sends the range even if
	 * finalization does not change the tree. Messages in this direction arrive in send order,
	 * so the Guest receives the range before a later tree update that uses its IDs.
	 *
	 * This method forwards the finalized range; it does not submit one for finalization.
	 *
	 * @param range - The creation range finalized by the Host runtime.
	 * @throws {@link SandboxProtocolError} if the range IDs are exhausted.
	 */
	private sendFinalizedRange(range: IdCreationRange): void {
		if (this.nextIdRangeId > Number.MAX_SAFE_INTEGER) {
			throw new SandboxProtocolError("Host ID range identifiers are exhausted.");
		}
		assert(range.ids !== undefined, 0xd60 /* Finalized ID range must contain IDs */);
		this.postMessage({
			hostIdRange: {
				rangeId: brand<HostIdRangeId>(this.nextIdRangeId++),
				parentIdSpaceShardSyncToken: this.getParentIdSpaceShardSyncToken(),
				range: { ...range, ids: range.ids },
			},
		});
	}

	private createInitializationMessage(idCompressor: IIdCompressor): HostInitializationMessage {
		const initialization = this.synchronization.guestInitialization;
		const checkout = this.mainCheckout.fork();
		try {
			const branch = checkout.mainBranch;
			const base = findAncestor(
				branch.getHead(),
				(commit) => commit.revision === initialization.baseRevision,
			);
			assert(
				base !== undefined,
				0xd61 /* Expected the Guest initialization base in Host history */,
			);
			checkout.switchBranch(branch.fork(base));
			branch.dispose();
			const cursor = checkout.forest.allocateCursor();
			try {
				moveToDetachedField(checkout.forest, cursor);
				const options = {
					jsonValidator: sandboxFormatValidator,
					minVersionForCollab: FluidClientVersion.v2_80,
				};
				const tree = fieldBatchCodecBuilder
					.build(options)
					.encode([castCursorToSynchronous(cursor)], {
						encodeType: TreeCompressionStrategy.Compressed,
						idCompressor,
						schema: { schema: checkout.storedSchema, policy: defaultSchemaPolicy },
						isSummary: true,
					});
				const normalizedTree = normalizeTransportData(tree);
				const normalizedSchema = normalizeTransportData(
					schemaCodecBuilder.build(options).encode(checkout.storedSchema),
				);
				validateTreePayloadVocabulary(normalizedTree);
				validateTreePayloadVocabulary(normalizedSchema);

				// Create the ID space shard only after serializing the baseline and retained commits,
				// so that the child snapshot includes every ID the Guest needs during
				// initialization.
				const { serialized: serializedShard, syncToken } =
					this.idCompressor.shard(1)[0] ?? oob();
				this.guestIdSpaceShardToken = syncToken;

				return {
					...initialization,
					tree: normalizedTree as JsonCompatibleReadOnly,
					schema: normalizedSchema as JsonCompatibleReadOnly,
					idCompressor: serializedShard,
				};
			} finally {
				cursor.free();
			}
		} finally {
			checkout.dispose();
		}
	}

	/**
	 * Returns a promise that resolves when all changes known to the Host are reflected in the Guest,
	 * or undefined if all such changes are already reflected in the Guest.
	 *
	 * If new changes arrive while a promise is in progress, the existing promise resolves only
	 * after the new changes are also reflected in the Guest.
	 * A caller does not need to get the promise again after new changes arrive while it is pending.
	 * Pending promises reject on failure or disposal. Access after failure throws.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.synchronization.updateGuestPromise;
	}
}
