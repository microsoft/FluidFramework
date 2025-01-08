/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { Provider } from "nconf";
import { safelyParseJSON } from "@fluidframework/common-utils";
import { BoxcarType, IBoxcarMessage, IMessage } from "./messages";
import { IQueuedMessage } from "./queue";

/**
 * @internal
 */
export interface IPartitionLambdaPlugin {
	create(
		config: Provider,
		customizations?: Record<string, any>,
	): Promise<IPartitionLambdaFactory>;
	customize?(config: Provider): Promise<Record<string, any>>;
}

/**
 * Reasons why a lambda is closing
 * @internal
 */
export enum LambdaCloseType {
	Stop = "Stop",
	ActivityTimeout = "ActivityTimeout",
	Rebalance = "Rebalance",
	Error = "Error",
}

/**
 * @internal
 */
export enum LambdaName {
	Scribe = "Scribe",
}

/**
 * @internal
 */
export interface ILogger {
	info(message: string, metaData?: any): void;
	warn(message: string, metaData?: any): void;
	error(message: string, metaData?: any): void;
}

/**
 * @internal
 */
export interface IContextErrorData {
	/**
	 * Indicates whether the error is recoverable and the lambda should be restarted.
	 */
	restart: boolean;

	/**
	 * Indicates if the document should be marked as corrupt.
	 * Further messages will be dead-lettered.
	 * It should be set to the message that caused the corruption.
	 */
	markAsCorrupt?: IQueuedMessage;

	tenantId?: string;
	documentId?: string;

	/**
	 * For KafkaRunner logging purposes.
	 * Since KafkaRunner metric logs all the errors, this will indicate how the error was handled
	 * eg: doc corruption error / rdkafkaConsumer error, so that we can filter accordingly
	 */
	errorLabel?: string;
}

/**
 * @internal
 */
export interface IContext {
	/**
	 * Updates the checkpoint
	 */
	checkpoint(queuedMessage: IQueuedMessage, restartFlag?: boolean): void;

	/**
	 * Closes the context with an error.
	 * @param error - The error object or string
	 * @param errorData - Additional information about the error
	 */
	error(error: any, errorData: IContextErrorData): void;

	/**
	 * Used to log events / errors.
	 */
	readonly log: ILogger | undefined;

	/**
	 * Pauses the context
	 * @param offset - The offset to pause at. This is the offset from which it will be resumed.
	 * @param reason - The reason for pausing
	 */
	pause(offset: number, reason?: any): void;

	/**
	 * Resumes the context
	 */
	resume(): void;
}

/**
 * @internal
 */
export interface IPartitionLambda {
	/**
	 * Expire document partition after this long of no activity.
	 * When undefined, the default global IDocumentLambdaServerConfiguration.partitionActivityTimeout is used.
	 */
	readonly activityTimeout?: number;

	/**
	 * Processes an incoming message.
	 * @returns a Promise if there is async work required, otherwise `undefined`.
	 */
	handler(message: IQueuedMessage): Promise<void> | undefined;

	/**
	 * Closes the lambda. After being called handler will no longer be invoked and the lambda is expected to cancel
	 * any deferred work.
	 */
	close(closeType: LambdaCloseType): void;

	/**
	 * Pauses the lambda. It should clear any pending work.
	 */
	pause?(offset: number): void;

	/**
	 * Resumes the lambda. This is relevant for documentLambda to resume the documentPartition queueus.
	 */
	resume?(): void;
}

/**
 * Factory for creating lambda related objects
 * @internal
 */
export interface IPartitionLambdaFactory<TConfig = undefined> extends EventEmitter {
	/**
	 * Constructs a new lambda
	 */
	create(
		config: TConfig,
		context: IContext,
		updateActivityTime?: (activityTime?: number) => void,
	): Promise<IPartitionLambda>;

	/**
	 * Disposes of the lambda factory
	 */
	dispose(): Promise<void>;
}

/**
 * Lambda config
 * @internal
 */
export interface IPartitionLambdaConfig {
	tenantId: string;
	documentId: string;
}

/**
 * Whether the boxcar message includes the optional Routing Key fields.
 * @internal
 */
export function isCompleteBoxcarMessage(
	boxcar: IBoxcarMessage,
): boxcar is Required<IBoxcarMessage> {
	return boxcar.documentId !== undefined && boxcar.tenantId !== undefined;
}

/**
 * @internal
 */
export function extractBoxcar(message: IQueuedMessage): IBoxcarMessage {
	if (typeof message.value !== "string" && !Buffer.isBuffer(message.value)) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return message.value;
	}

	const messageContent = message.value.toString();

	const rawMessage = safelyParseJSON(messageContent);
	const parsedMessage = rawMessage as IMessage;

	if (!parsedMessage) {
		return {
			contents: [],
			documentId: undefined,
			tenantId: undefined,
			type: BoxcarType,
		};
	}

	if (parsedMessage.type === BoxcarType) {
		const boxcarMessage = parsedMessage as IBoxcarMessage;

		// Contents used to be a string - handle accordingly
		const contents =
			boxcarMessage.contents.length > 0 && typeof boxcarMessage.contents[0] === "string"
				? // eslint-disable-next-line @typescript-eslint/no-unsafe-return
				  boxcarMessage.contents.map((content: any) => JSON.parse(content))
				: boxcarMessage.contents;

		return {
			contents,
			documentId: boxcarMessage.documentId,
			tenantId: boxcarMessage.tenantId,
			type: boxcarMessage.type,
		};
	} else {
		return {
			contents: [parsedMessage],
			documentId: rawMessage.documentId,
			tenantId: rawMessage.tenantId,
			type: BoxcarType,
		};
	}
}
