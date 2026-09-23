/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import type { ICodecOptions } from "../../../codec/index.js";
import type { ChangeMetadata } from "../../../core/index.js";
import {
	independentInitializedView,
	type ForestOptions,
	type ViewContent,
} from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type {
	ImplicitFieldSchema,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

import {
	type AcknowledgmentMessage,
	type DataChangeMessage,
	type HostGuestMessage,
	getRevision,
	makePromiseWithResolver,
	normalizeProtocolError,
	parseHostGuestMessage,
	type PromiseWithResolver,
	throwProtocolError,
	validateTreePayload,
} from "./common.js";
import { GuestHandleCodec, normalizeTransportData } from "./handles.js";

/**
 * An independent TreeView synchronized with a Host through a message protocol.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Guest<const TSchema extends ImplicitFieldSchema> {
	private readonly codec: GuestHandleCodec;
	/** The independent view on the Guest. */
	public readonly view: TreeViewAlpha<TSchema>;
	/** The number of local Guest changes that the Host has not acknowledged. */
	private inFlight: number = 0;
	/**
	 * The promise and resolver for the process of sending changes to the Host.
	 * When this is defined, the Host has not acknowledged all Guest changes.
	 * The promise resolves when the Host acknowledges all Guest changes.
	 * When this is undefined, the Host is up to date with the Guest.
	 */
	private pushInProgress?: PromiseWithResolver;
	/** The callback that unsubscribes from view changes. */
	private readonly offViewChanged: () => void;
	/** Whether the Guest is applying changes from the Host. */
	private isApplyingChangesFromHost: boolean = false;

	/** Receives and routes protocol messages from the Host. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		try {
			const message = parseHostGuestMessage(this.codec.decode(event.data));
			switch (message.type) {
				case "dataChange": {
					this.receiveChangeFromHost(message.change);
					break;
				}
				case "acknowledgment": {
					this.receiveAckFromHost();
					break;
				}
				case "blobResponse": {
					this.codec.receiveResponse(message);
					break;
				}
				case "blobRequest": {
					throw new Error("The Guest cannot receive blob requests.");
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
		this.codec = new GuestHandleCodec((message) => this.postMessage(message));
		const tree = this.codec.decode(content.tree);
		validateTreePayload(tree);
		this.view = independentInitializedView(config, options, {
			...content,
			tree: tree as ViewContent["tree"],
		});
		this.offViewChanged = this.view.events.on("changed", (metadata: ChangeMetadata) => {
			if (metadata.isLocal && !this.isApplyingChangesFromHost) {
				const newChange = metadata.getChange();
				// MessagePort delivery is asynchronous. Validate and send before recording a pending edit.
				this.postMessage({
					type: "dataChange",
					change: newChange,
				} satisfies DataChangeMessage);
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
			}
		});
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	public dispose(): void {
		this.codec.dispose();
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.port.close();
		this.pushInProgress = undefined;
		this.offViewChanged();
		this.view.dispose();
	}

	/**
	 * Attempts to apply a change from the Host.
	 * The change is ignored if local changes have not yet been reflected on the Host.
	 * The Guest sends an acknowledgment only if it applies the update.
	 *
	 * @param change - The change to apply.
	 */
	private receiveChangeFromHost(change: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
			// This update does not account for the local changes that the Host has not received.
			// Ignore it. The Host will send another update after it receives the local changes.
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
		this.postMessage({ type: "acknowledgment" } satisfies AcknowledgmentMessage);
	}

	private postMessage(message: HostGuestMessage): void {
		const normalized = normalizeTransportData(message);
		parseHostGuestMessage(normalized);
		this.port.postMessage(this.codec.encode(normalized));
	}

	/** Processes the Host's acknowledgment of a local Guest change. */
	private receiveAckFromHost(): void {
		assert(this.inFlight > 0, "Unexpectedly received ack from Host");
		this.logger(`Guest: local change acked (inFlight:${this.inFlight}->${this.inFlight - 1})`);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
			// The Host has now caught up with all local changes.
			assert(
				this.pushInProgress !== undefined,
				"Missing push promise despite in-flight changes",
			);
			const resolver = this.pushInProgress.resolver;
			this.pushInProgress = undefined;
			this.logger("Guest:   all my changes were acked. Resolving push promise.");
			resolver();
		}
	}

	/**
	 * Returns a promise that resolves when the Host acknowledges all changes made on the Guest,
	 * or undefined if no such changes are in flight.
	 *
	 * If new local changes are made while a promise is in progress, the existing promise resolves
	 * only after the Host acknowledges the new changes too.
	 * A caller does not need to get the promise again after making new changes while it is pending.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}
}
