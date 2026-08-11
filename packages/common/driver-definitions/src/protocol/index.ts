/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Core set of Fluid protocol interfaces shared between services and clients.
 * These interfaces must always be back and forward compatible.
 *
 * @packageDocumentation
 */

export type {
	ConnectionMode,
	ICapabilities,
	IClient,
	IClientDetails,
	IClientJoin,
	ISequencedClient,
	ISignalClient,
} from "./clients.js";
export type { IClientConfiguration } from "./config.js";
export type {
	IApprovedProposal,
	ICommittedProposal,
	IProcessMessageResult,
	IProposal,
	IProtocolState,
	IQuorum,
	IQuorumClients,
	IQuorumProposals,
	ISequencedProposal,
} from "./consensus.js";
export type { IsoDate } from "./date.js";
export type {
	IBranchOrigin,
	IDocumentMessage,
	IDocumentSystemMessage,
	INack,
	INackContent,
	ISentSignalMessage,
	ISequencedDocumentAugmentedMessage,
	ISequencedDocumentMessage,
	ISequencedDocumentMessageExperimental,
	ISequencedDocumentSystemMessage,
	IServerError,
	ISignalMessage,
	ISignalMessageBase,
	ISummaryAck,
	ISummaryContent,
	ISummaryNack,
	ISummaryProposal,
	ITrace,
	IUploadedSummaryDetails,
} from "./protocol.js";
export { MessageType, NackErrorType, SignalType } from "./protocol.js";
export { ScopeType } from "./scopes.js";
export type { IConnect, IConnected } from "./sockets.js";
export type {
	IAttachment,
	IBlob,
	ICreateBlobResponse,
	IDocumentAttributes,
	ISnapshotTree,
	ISnapshotTreeEx,
	ITree,
	ITreeEntry,
	IVersion,
} from "./storage.js";
export { FileMode, TreeEntry } from "./storage.js";
export type {
	ISummaryAttachment,
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	SummaryObject,
	SummaryTree,
	SummaryTypeNoHandle,
} from "./summary.js";
export { SummaryType } from "./summary.js";
export type { ITokenClaims } from "./tokens.js";
export type { IUser } from "./users.js";
