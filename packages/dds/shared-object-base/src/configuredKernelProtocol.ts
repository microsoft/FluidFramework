/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	ChannelConfiguration,
	ChannelConfigurationController,
	ConfigurationChangeResult,
} from "./channelConfiguration.js";
import { parseConfiguredChannelMessage } from "./channelConfigurationFormat.js";
import type { SharedKernelMessageCollection } from "./sharedObjectKernel.js";
import type { SharedObjectProtocol } from "./sharedObjectProtocol.js";

/**
 * Routes a configured kernel's transport while retaining ordinary DDS hooks and metadata.
 */
export class ConfiguredKernelProtocol<TConfig extends ChannelConfiguration>
	implements SharedObjectProtocol
{
	private replayRevision: number | undefined;
	private submittingControl = false;
	private readonly pendingSubmissions: { contents: unknown; metadata: unknown }[] = [];

	public constructor(
		public readonly controller: ChannelConfigurationController<TConfig>,
		private readonly submit: (contents: unknown, metadata: unknown) => void,
		private readonly verifyCanSubmit: () => void,
		private readonly isPublished: () => boolean,
		private readonly recordResult: (result: ConfigurationChangeResult<TConfig>) => void,
	) {}

	public submitWhileDetached(contents: unknown, metadata: unknown): void {
		if (this.isPublished()) {
			// The initial snapshot is already captured, but the runtime has not connected the channel.
			this.pendingSubmissions.push({ contents, metadata });
		}
	}

	public flushPendingSubmissions(): void {
		for (const { contents, metadata } of this.pendingSubmissions.splice(0)) {
			this.submitControl(contents, metadata);
		}
	}

	public submitControl(contents: unknown, metadata: unknown): void {
		this.submittingControl = true;
		try {
			this.submit(contents, metadata);
		} finally {
			this.submittingControl = false;
		}
	}

	public prepareLocalMessage(content: unknown): unknown {
		this.verifyCanSubmit();
		if (this.submittingControl) {
			return content;
		}
		return {
			version: 1,
			kind: "operation",
			revision: this.replayRevision ?? this.controller.current.revision,
			contents: content,
		};
	}

	public processMessages(
		messages: IRuntimeMessageCollection,
		deliver: (messages: IRuntimeMessageCollection) => void,
	): void {
		this.controller.verifyCanSubmit();
		const ordinary: SharedKernelMessageCollection["messagesContent"][number][] = [];
		const flush = (): void => {
			if (ordinary.length > 0) {
				deliver({ ...messages, messagesContent: [...ordinary] });
				ordinary.length = 0;
			}
		};
		for (const [messageIndex, message] of messages.messagesContent.entries()) {
			const envelope = parseConfiguredChannelMessage(message.contents);
			if (envelope.kind === "configuration") {
				flush();
				const result = this.controller.process(
					envelope,
					{
						source: "sequenced",
						sequenceNumber: messages.envelope.sequenceNumber,
						clientSequenceNumber: message.clientSequenceNumber,
						messageIndex,
						local: messages.local,
					},
					message.localOpMetadata,
				);
				this.recordResult(result);
			} else {
				this.verifyRevision(envelope.revision);
				ordinary.push({
					...message,
					contents: envelope.contents,
					configurationRevision: envelope.revision,
				});
			}
		}
		flush();
	}

	public applyStashedOp(content: unknown, apply: (content: unknown) => void): void {
		const message = parseConfiguredChannelMessage(content);
		if (message.kind === "configuration") {
			this.controller.applyStashedOp(message);
		} else {
			this.withRevision(message.revision, () => apply(message.contents));
		}
	}

	public reSubmit(
		content: unknown,
		metadata: unknown,
		submit: (content: unknown, metadata: unknown) => void,
	): void {
		const message = parseConfiguredChannelMessage(content);
		if (message.kind === "configuration") {
			this.controller.reSubmit(message, metadata);
		} else {
			this.withRevision(message.revision, () => submit(message.contents, metadata));
		}
	}

	public rollback(
		content: unknown,
		metadata: unknown,
		rollback: (content: unknown, metadata: unknown) => void,
	): void {
		const message = parseConfiguredChannelMessage(content);
		if (message.kind === "configuration") {
			this.controller.rollback(metadata);
		} else {
			this.withRevision(message.revision, () => rollback(message.contents, metadata));
		}
	}

	public close(error: unknown): void {
		this.controller.dispose(error);
		this.pendingSubmissions.length = 0;
	}

	private verifyRevision(revision: number): void {
		if (revision > this.controller.current.revision) {
			throw new UsageError("Channel operation has a future configuration revision");
		}
	}

	private withRevision(revision: number, callback: () => void): void {
		this.verifyRevision(revision);
		const previous = this.replayRevision;
		this.replayRevision = revision;
		try {
			callback();
		} finally {
			this.replayRevision = previous;
		}
	}
}
