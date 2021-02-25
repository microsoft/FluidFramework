/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { safelyParseJSON } from "@fluidframework/common-utils";
import nconf from "nconf";
import { BoxcarType, IBoxcarMessage, IMessage } from "./messages";
import { IQueuedMessage } from "./queue";

/**
 * Reasons why a lambda is closing
 */
export enum LambdaCloseType {
    Stop,
    ActivityTimeout,
    Rebalance,
    Error,
}

export interface ILogger {
    info(message: string, metaData?: any): void;
    warn(message: string, metaData?: any): void;
    error(message: string, metaData?: any): void;
}

export interface IContextErrorData {
    /**
     * Indicates whether the error is recoverable and the lambda should be restarted.
     */
    restart: boolean;

    tenantId?: string;
    documentId?: string;
}

export interface IContext {
    /**
     * Updates the checkpoint
     */
    checkpoint(queuedMessage: IQueuedMessage): void;

    /**
     * Closes the context with an error.
     * @param error The error object or string
     * @param errorData Additional information about the error
     */
    error(error: any, errorData: IContextErrorData): void;

    /**
     * Used to log events / errors.
     */
    readonly log: ILogger | undefined;
}

export interface IPartitionLambda {
    /**
     * Processes an incoming message
     */
    handler(message: IQueuedMessage): void;

    /**
     * Closes the lambda. After being called handler will no longer be invoked and the lambda is expected to cancel
     * any deferred work.
     */
    close(closeType: LambdaCloseType): void;
}

/**
 * Factory for creating lambda related objects
 */
export interface IPartitionLambdaFactory extends EventEmitter {
    /**
     * Constructs a new lambda
     */
    create(config: nconf.Provider, context: IContext, updateActivityTime?: () => void): Promise<IPartitionLambda>;

    /**
     * Disposes of the lambda factory
     */
    dispose(): Promise<void>;
}

/**
 * Lambda plugin definition
 */
export interface IPlugin {
    /**
     * Creates and returns a new lambda factory. Config is provided should the factory need to load any resources
     * prior to being fully constructed.
     */
    create(config: nconf.Provider): Promise<IPartitionLambdaFactory>;
}

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
            // eslint-disable-next-line no-null/no-null
            documentId: null,
            // eslint-disable-next-line no-null/no-null
            tenantId: null,
            type: BoxcarType,
        };
    }

    if (parsedMessage.type === BoxcarType) {
        const boxcarMessage = parsedMessage as IBoxcarMessage;

        // Contents used to be a string - handle accordingly
        const contents = boxcarMessage.contents.length > 0 && typeof boxcarMessage.contents[0] === "string"
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            ? boxcarMessage.contents.map((content: any) => JSON.parse(content))
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
