/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";

import type {
	ChannelConfiguration,
	ChannelConfigurationController,
	ConfigurationChangeResult,
} from "./channelConfiguration.js";
import {
	hasChannelConfigurationMarker,
	parseChannelConfigurationMessage,
	verifyOrdinaryChannelMessage,
} from "./channelConfigurationFormat.js";
import type { SharedKernelMessageCollection } from "./sharedObjectKernel.js";
import type { SharedObjectProtocol } from "./sharedObjectProtocol.js";

/**
 * Routes a configuration-capable kernel's transport, including before its first configuration op.
 * Retains ordinary DDS hooks and metadata.
 */
export class ConfiguredKernelProtocol<TConfig extends ChannelConfiguration>
	implements SharedObjectProtocol
{
	private submittingControl = false;

	readonly #submit: (contents: unknown, metadata: unknown) => void;
	readonly #verifyCanSubmit: () => void;
	readonly #verifyConfigurationEnabled: () => void;
	readonly #recordResult: (result: ConfigurationChangeResult<TConfig>) => void;

	public constructor(
		public readonly controller: ChannelConfigurationController<TConfig>,
		submit: (contents: unknown, metadata: unknown) => void,
		verifyCanSubmit: () => void,
		verifyConfigurationEnabled: () => void,
		recordResult: (result: ConfigurationChangeResult<TConfig>) => void,
	) {
		this.#submit = submit;
		this.#verifyCanSubmit = verifyCanSubmit;
		this.#verifyConfigurationEnabled = verifyConfigurationEnabled;
		this.#recordResult = recordResult;
	}

	public submitWhileDetached(contents: unknown, metadata: unknown): void {}

	public submitControl(contents: unknown, metadata: unknown): void {
		this.#verifyConfigurationEnabled();
		this.submittingControl = true;
		try {
			this.#submit(contents, metadata);
		} finally {
			this.submittingControl = false;
		}
	}

	public prepareLocalMessage(content: unknown): unknown {
		this.#verifyCanSubmit();
		if (this.submittingControl) {
			// Consume the bypass before submission can synchronously trigger another DDS edit.
			this.submittingControl = false;
			return content;
		}
		verifyOrdinaryChannelMessage(content);
		return content;
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
			if (hasChannelConfigurationMarker(message.contents)) {
				flush();
				this.#verifyConfigurationEnabled();
				const proposal = parseChannelConfigurationMessage(message.contents);
				const result = this.controller.process(
					proposal,
					{
						source: "sequenced",
						sequenceNumber: messages.envelope.sequenceNumber,
						clientSequenceNumber: message.clientSequenceNumber,
						messageIndex,
						local: messages.local,
					},
					message.localOpMetadata,
				);
				this.#recordResult(result);
			} else {
				ordinary.push(message);
			}
		}
		flush();
	}

	public applyStashedOp(content: unknown, apply: (content: unknown) => void): void {
		if (hasChannelConfigurationMarker(content)) {
			this.controller.applyStashedOp(parseChannelConfigurationMessage(content));
		} else {
			apply(content);
		}
	}

	public reSubmit(
		content: unknown,
		metadata: unknown,
		submit: (content: unknown, metadata: unknown) => void,
	): void {
		if (hasChannelConfigurationMarker(content)) {
			this.controller.reSubmit(parseChannelConfigurationMessage(content), metadata);
		} else {
			submit(content, metadata);
		}
	}

	public rollback(
		content: unknown,
		metadata: unknown,
		rollback: (content: unknown, metadata: unknown) => void,
	): void {
		if (hasChannelConfigurationMarker(content)) {
			parseChannelConfigurationMessage(content);
			this.controller.rollback(metadata);
		} else {
			rollback(content, metadata);
		}
	}

	public close(error: unknown): void {
		this.controller.dispose(error);
	}
}
