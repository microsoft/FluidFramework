/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { IClient, IDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	ICollection,
	IContext,
	IDocumentDetails,
	IOrderer,
	ISequencedOperationMessage,
	IQueuedMessage,
	IServiceConfiguration,
	IDocumentRepository,
	CheckpointService,
	IDocument,
	ICheckpointRepository,
} from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface IConcreteNode extends EventEmitter {
	id: string;

	valid: boolean;

	connectOrderer(tenantId: string, documentId: string): Promise<IOrderer>;
}

/**
 * @internal
 */
export interface IReservationManager {
	/**
	 * Retrieves an existing reservation
	 */
	getOrReserve(key: string, node: IConcreteNode): Promise<IConcreteNode>;
}

/**
 * @internal
 */
export interface IConcreteNodeFactory {
	create(): Promise<IConcreteNode>;
}

/**
 * @internal
 */
export interface IOpMessage {
	topic: string;
	op: string;
	data: any[];
}

/**
 * @internal
 */
export interface IConnectMessage {
	tenantId: string;
	documentId: string;
	client: IClient;
}

/**
 * @internal
 */
export interface IConnectedMessage {
	clientId: string;
	existing: boolean;
	maxMessageSize: number;
	serviceConfiguration: IServiceConfiguration;
}

/**
 * @internal
 */
export interface INodeMessage {
	// Connection identifier
	cid: number;

	// Better way to do the before in TS?
	type: "order" | "op" | "connect" | "disconnect" | "connected";

	payload: IDocumentMessage | string | IOpMessage | IConnectMessage | IConnectedMessage;
}

/**
 * @internal
 */
export interface ILocalOrdererSetup {
	/**
	 * @deprecated use documentRepositoryP() instead
	 */
	documentCollectionP(): Promise<ICollection<IDocument>>;
	documentP(): Promise<IDocumentDetails>;
	documentRepositoryP(): Promise<IDocumentRepository>;
	deliCheckpointRepositoryP(): Promise<ICheckpointRepository>;
	scribeCheckpointRepositoryP(): Promise<ICheckpointRepository>;
	checkpointServiceP(service: string): Promise<CheckpointService>;
	deltaCollectionP(): Promise<ICollection<any>>;
	scribeDeltaCollectionP(): Promise<ICollection<ISequencedOperationMessage>>;
	protocolHeadP(): Promise<number>;
	scribeMessagesP(): Promise<ISequencedOperationMessage[]>;
}

/**
 * @internal
 */
export interface IKafkaSubscriber {
	readonly context: IContext;

	process(message: IQueuedMessage): Promise<void> | undefined;
}
