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
	getRevision,
	makePromiseWithResolver,
	normalizeProtocolError,
	parseHostGuestMessage,
	type PromiseWithResolver,
	throwProtocolError,
} from "./common.js";

/** An independent TreeView synchronized with a Host through a message protocol. */
export class Guest<const TSchema extends ImplicitFieldSchema> {
	public readonly view: TreeViewAlpha<TSchema>;
	private inFlight: number = 0;
	private pushInProgress?: PromiseWithResolver;
	private readonly offViewChanged: () => void;
	private isApplyingChangesFromHost: boolean = false;

	private readonly onMessage = (event: MessageEvent<unknown>): void => {
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

	private readonly onMessageError = (): void => {
		this.handleProtocolError(new Error("The Guest could not deserialize a protocol message."));
	};

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		private readonly port: MessagePort,
		private readonly handleProtocolError: (error: Error) => void = throwProtocolError,
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
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.port.close();
		this.pushInProgress = undefined;
		this.offViewChanged();
		this.view.dispose();
	}

	private receiveChangeFromHost(change: JsonCompatibleReadOnly): void {
		if (this.inFlight > 0) {
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

	private receiveAckFromHost(): void {
		assert(this.inFlight > 0, "Unexpectedly received ack from Host");
		this.logger(`Guest: local change acked (inFlight:${this.inFlight}->${this.inFlight - 1})`);
		this.inFlight -= 1;

		if (this.inFlight === 0) {
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

	/** Resolves when all Guest changes have been acknowledged by the Host. */
	public get updateHostPromise(): Promise<void> | undefined {
		return this.pushInProgress?.promise;
	}
}
