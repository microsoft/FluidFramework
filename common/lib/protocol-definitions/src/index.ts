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
	IQuorumClientsEvents,
	IQuorumEvents,
	IQuorumProposals,
	IQuorumProposalsEvents,
	ISequencedProposal,
} from "./consensus.js";
export type { IsoDate } from "./date.js";
export {
	type IBranchOrigin,
	type IDocumentMessage,
	type IDocumentSystemMessage,
	type INack,
	type INackContent,
	type ISentSignalMessage,
	type ISequencedDocumentAugmentedMessage,
	type ISequencedDocumentMessage,
	type ISequencedDocumentMessageExperimental,
	type ISequencedDocumentSystemMessage,
	type IServerError,
	type ISignalMessage,
	type ISignalMessageBase,
	type ISummaryAck,
	type ISummaryContent,
	type ISummaryNack,
	type ISummaryProposal,
	type ITrace,
	type IUploadedSummaryDetails,
	MessageType,
	NackErrorType,
	SignalType,
} from "./protocol.js";
export { ScopeType } from "./scopes.js";
export type { IConnect, IConnected } from "./sockets.js";
export {
	FileMode,
	type IAttachment,
	type IBlob,
	type ICreateBlobResponse,
	type IDocumentAttributes,
	type ISnapshotTree,
	type ISnapshotTreeEx,
	type ITree,
	type ITreeEntry,
	type IVersion,
	TreeEntry,
} from "./storage.js";
export {
	type ISummaryAttachment,
	type ISummaryBlob,
	type ISummaryHandle,
	type ISummaryTree,
	type SummaryObject,
	type SummaryTree,
	SummaryType,
	type SummaryTypeNoHandle,
} from "./summary.js";
export type {
	IActorClient,
	ISummaryTokenClaims,
	ITokenClaims,
	ITokenProvider,
	ITokenService,
} from "./tokens.js";
export type { IUser } from "./users.js";
