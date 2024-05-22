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

export {
	ConnectionMode,
	ICapabilities,
	IClient,
	IClientDetails,
	IClientJoin,
	ISequencedClient,
	ISignalClient,
} from "./clients.js";
export { IClientConfiguration } from "./config.js";
export {
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
export { IsoDate } from "./date.js";
export {
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
	MessageType,
	NackErrorType,
	SignalType,
} from "./protocol.js";
export { ScopeType } from "./scopes.js";
export { IConnect, IConnected } from "./sockets.js";
export {
	FileMode,
	IAttachment,
	IBlob,
	ICreateBlobResponse,
	IDocumentAttributes,
	ISnapshotTree,
	ISnapshotTreeEx,
	ITree,
	ITreeEntry,
	IVersion,
	TreeEntry,
} from "./storage.js";
export {
	ISummaryAttachment,
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	SummaryObject,
	SummaryTree,
	SummaryType,
	SummaryTypeNoHandle,
} from "./summary.js";
export {
	IActorClient,
	ISummaryTokenClaims,
	ITokenClaims,
	ITokenProvider,
	ITokenService,
} from "./tokens.js";
export { IUser } from "./users.js";
