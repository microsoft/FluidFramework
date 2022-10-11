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
} from "./clients";
export { IClientConfiguration } from "./config";
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
} from "./consensus";
export { IsoDate } from "./date";
export {
    IBranchOrigin,
    IDocumentMessage,
    IDocumentSystemMessage,
    IHelpMessage,
    INack,
    INackContent,
    IQueueMessage,
    ISequencedDocumentAugmentedMessage,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    IServerError,
    ISignalMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    ISummaryProposal,
    ITrace,
    IUploadedSummaryDetails,
    MessageType,
    NackErrorType,
    SignalType,
} from "./protocol";
export { ScopeType } from "./scopes";
export { IConnect, IConnected } from "./sockets";
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
} from "./storage";
export {
    ISummaryAttachment,
    ISummaryBlob,
    ISummaryHandle,
    ISummaryTree,
    SummaryObject,
    SummaryTree,
    SummaryType,
    SummaryTypeNoHandle,
} from "./summary";
export {
    IActorClient,
    ISummaryTokenClaims,
    ITokenClaims,
    ITokenProvider,
    ITokenService,
} from "./tokens";
export { IUser } from "./users";
