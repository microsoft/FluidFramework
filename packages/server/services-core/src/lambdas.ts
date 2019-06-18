/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { safelyParseJSON } from "@prague/utils";
import { EventEmitter } from "events";
import * as nconf from "nconf";
import { IKafkaMessage } from "./kafka";
import { BoxcarType, IBoxcarMessage, IMessage } from "./messages";

export interface IContext {
    /**
     * Updates the checkpoint offset
     */
    checkpoint(offset: number);

    /**
     * Closes the context with an error. The restart flag indicates whether the error is recoverable and the lambda
     * should be restarted.
     */
    error(error: any, restart: boolean);
}

export interface IPartitionLambda {
    /**
     * Processes an incoming message
     */
    handler(message: IKafkaMessage): void;

    /**
     * Closes the lambda. After being called handler will no longer be invoked and the lambda is expected to cancel
     * any deferred work.
     */
    close(): void;
}

/**
 * Factory for creating lambda related objects
 */
export interface IPartitionLambdaFactory extends EventEmitter {
    /**
     * Constructs a new lambda
     */
    create(config: nconf.Provider, context: IContext): Promise<IPartitionLambda>;

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

export function extractBoxcar(message: IKafkaMessage): IBoxcarMessage {
    if (typeof message.value !== "string" && !Buffer.isBuffer(message.value)) {
        return message.value;
    }

    const messageContent = message.value.toString();

    const rawMessage = safelyParseJSON(messageContent);
    const parsedMessage = rawMessage as IMessage;

    if (!parsedMessage) {
        return {
            contents: [],
            documentId: null,
            tenantId: null,
            type: BoxcarType,
        };
    }

    if (parsedMessage.type === BoxcarType) {
        const boxcarMessage = parsedMessage as IBoxcarMessage;

        // Contents used to be a string - handle accordingly
        const contents = boxcarMessage.contents.length > 0 && typeof boxcarMessage.contents[0] === "string"
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
