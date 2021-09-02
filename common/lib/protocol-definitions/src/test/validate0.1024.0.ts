/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as old from "@fluidframework/protocol-definitions-0.1024.0";
import * as current from "../index";

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ConnectionMode": {"forwardCompat": false}
declare function set_current_ConnectionMode(set: current.ConnectionMode);
declare function get_old_ConnectionMode(): old.ConnectionMode;
set_current_ConnectionMode(get_old_ConnectionMode());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ConnectionMode": {"backCompat": false}
declare function set_old_ConnectionMode(set: old.ConnectionMode);
declare function get_current_ConnectionMode(): current.ConnectionMode;
set_old_ConnectionMode(get_current_ConnectionMode());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "FileMode": {"forwardCompat": false}
declare function set_current_FileMode(set: current.FileMode);
declare function get_old_FileMode(): old.FileMode;
set_current_FileMode(get_old_FileMode());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "FileMode": {"backCompat": false}
declare function set_old_FileMode(set: old.FileMode);
declare function get_current_FileMode(): current.FileMode;
set_old_FileMode(get_current_FileMode());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IActorClient": {"forwardCompat": false}
declare function set_current_IActorClient(set: current.IActorClient);
declare function get_old_IActorClient(): old.IActorClient;
set_current_IActorClient(get_old_IActorClient());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IActorClient": {"backCompat": false}
declare function set_old_IActorClient(set: old.IActorClient);
declare function get_current_IActorClient(): current.IActorClient;
set_old_IActorClient(get_current_IActorClient());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IApprovedProposal": {"forwardCompat": false}
declare function set_current_IApprovedProposal(set: current.IApprovedProposal);
declare function get_old_IApprovedProposal(): old.IApprovedProposal;
set_current_IApprovedProposal(get_old_IApprovedProposal());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IApprovedProposal": {"backCompat": false}
declare function set_old_IApprovedProposal(set: old.IApprovedProposal);
declare function get_current_IApprovedProposal(): current.IApprovedProposal;
set_old_IApprovedProposal(get_current_IApprovedProposal());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IAttachment": {"forwardCompat": false}
declare function set_current_IAttachment(set: current.IAttachment);
declare function get_old_IAttachment(): old.IAttachment;
set_current_IAttachment(get_old_IAttachment());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IAttachment": {"backCompat": false}
declare function set_old_IAttachment(set: old.IAttachment);
declare function get_current_IAttachment(): current.IAttachment;
set_old_IAttachment(get_current_IAttachment());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IBlob": {"forwardCompat": false}
declare function set_current_IBlob(set: current.IBlob);
declare function get_old_IBlob(): old.IBlob;
set_current_IBlob(get_old_IBlob());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IBlob": {"backCompat": false}
declare function set_old_IBlob(set: old.IBlob);
declare function get_current_IBlob(): current.IBlob;
set_old_IBlob(get_current_IBlob());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IBranchOrigin": {"forwardCompat": false}
declare function set_current_IBranchOrigin(set: current.IBranchOrigin);
declare function get_old_IBranchOrigin(): old.IBranchOrigin;
set_current_IBranchOrigin(get_old_IBranchOrigin());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IBranchOrigin": {"backCompat": false}
declare function set_old_IBranchOrigin(set: old.IBranchOrigin);
declare function get_current_IBranchOrigin(): current.IBranchOrigin;
set_old_IBranchOrigin(get_current_IBranchOrigin());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ICapabilities": {"forwardCompat": false}
declare function set_current_ICapabilities(set: current.ICapabilities);
declare function get_old_ICapabilities(): old.ICapabilities;
set_current_ICapabilities(get_old_ICapabilities());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ICapabilities": {"backCompat": false}
declare function set_old_ICapabilities(set: old.ICapabilities);
declare function get_current_ICapabilities(): current.ICapabilities;
set_old_ICapabilities(get_current_ICapabilities());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IClient": {"forwardCompat": false}
declare function set_current_IClient(set: current.IClient);
declare function get_old_IClient(): old.IClient;
set_current_IClient(get_old_IClient());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IClient": {"backCompat": false}
declare function set_old_IClient(set: old.IClient);
declare function get_current_IClient(): current.IClient;
set_old_IClient(get_current_IClient());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IClientConfiguration": {"forwardCompat": false}
declare function set_current_IClientConfiguration(set: current.IClientConfiguration);
declare function get_old_IClientConfiguration(): old.IClientConfiguration;
set_current_IClientConfiguration(get_old_IClientConfiguration());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IClientConfiguration": {"backCompat": false}
declare function set_old_IClientConfiguration(set: old.IClientConfiguration);
declare function get_current_IClientConfiguration(): current.IClientConfiguration;
set_old_IClientConfiguration(get_current_IClientConfiguration());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IClientDetails": {"forwardCompat": false}
declare function set_current_IClientDetails(set: current.IClientDetails);
declare function get_old_IClientDetails(): old.IClientDetails;
set_current_IClientDetails(get_old_IClientDetails());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IClientDetails": {"backCompat": false}
declare function set_old_IClientDetails(set: old.IClientDetails);
declare function get_current_IClientDetails(): current.IClientDetails;
set_old_IClientDetails(get_current_IClientDetails());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IClientJoin": {"forwardCompat": false}
declare function set_current_IClientJoin(set: current.IClientJoin);
declare function get_old_IClientJoin(): old.IClientJoin;
set_current_IClientJoin(get_old_IClientJoin());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IClientJoin": {"backCompat": false}
declare function set_old_IClientJoin(set: old.IClientJoin);
declare function get_current_IClientJoin(): current.IClientJoin;
set_old_IClientJoin(get_current_IClientJoin());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ICommittedProposal": {"forwardCompat": false}
declare function set_current_ICommittedProposal(set: current.ICommittedProposal);
declare function get_old_ICommittedProposal(): old.ICommittedProposal;
set_current_ICommittedProposal(get_old_ICommittedProposal());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ICommittedProposal": {"backCompat": false}
declare function set_old_ICommittedProposal(set: old.ICommittedProposal);
declare function get_current_ICommittedProposal(): current.ICommittedProposal;
set_old_ICommittedProposal(get_current_ICommittedProposal());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IConnect": {"forwardCompat": false}
declare function set_current_IConnect(set: current.IConnect);
declare function get_old_IConnect(): old.IConnect;
set_current_IConnect(get_old_IConnect());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IConnect": {"backCompat": false}
declare function set_old_IConnect(set: old.IConnect);
declare function get_current_IConnect(): current.IConnect;
set_old_IConnect(get_current_IConnect());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IConnected": {"forwardCompat": false}
declare function set_current_IConnected(set: current.IConnected);
declare function get_old_IConnected(): old.IConnected;
set_current_IConnected(get_old_IConnected());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IConnected": {"backCompat": false}
declare function set_old_IConnected(set: old.IConnected);
declare function get_current_IConnected(): current.IConnected;
set_old_IConnected(get_current_IConnected());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ICreateBlobResponse": {"forwardCompat": false}
declare function set_current_ICreateBlobResponse(set: current.ICreateBlobResponse);
declare function get_old_ICreateBlobResponse(): old.ICreateBlobResponse;
set_current_ICreateBlobResponse(get_old_ICreateBlobResponse());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IDocumentAttributes": {"forwardCompat": false}
declare function set_current_IDocumentAttributes(set: current.IDocumentAttributes);
declare function get_old_IDocumentAttributes(): old.IDocumentAttributes;
set_current_IDocumentAttributes(get_old_IDocumentAttributes());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IDocumentAttributes": {"backCompat": false}
declare function set_old_IDocumentAttributes(set: old.IDocumentAttributes);
declare function get_current_IDocumentAttributes(): current.IDocumentAttributes;
set_old_IDocumentAttributes(get_current_IDocumentAttributes());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IDocumentMessage": {"forwardCompat": false}
declare function set_current_IDocumentMessage(set: current.IDocumentMessage);
declare function get_old_IDocumentMessage(): old.IDocumentMessage;
set_current_IDocumentMessage(get_old_IDocumentMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IDocumentMessage": {"backCompat": false}
declare function set_old_IDocumentMessage(set: old.IDocumentMessage);
declare function get_current_IDocumentMessage(): current.IDocumentMessage;
set_old_IDocumentMessage(get_current_IDocumentMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IDocumentSystemMessage": {"forwardCompat": false}
declare function set_current_IDocumentSystemMessage(set: current.IDocumentSystemMessage);
declare function get_old_IDocumentSystemMessage(): old.IDocumentSystemMessage;
set_current_IDocumentSystemMessage(get_old_IDocumentSystemMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IDocumentSystemMessage": {"backCompat": false}
declare function set_old_IDocumentSystemMessage(set: old.IDocumentSystemMessage);
declare function get_current_IDocumentSystemMessage(): current.IDocumentSystemMessage;
set_old_IDocumentSystemMessage(get_current_IDocumentSystemMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IHelpMessage": {"forwardCompat": false}
declare function set_current_IHelpMessage(set: current.IHelpMessage);
declare function get_old_IHelpMessage(): old.IHelpMessage;
set_current_IHelpMessage(get_old_IHelpMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IHelpMessage": {"backCompat": false}
declare function set_old_IHelpMessage(set: old.IHelpMessage);
declare function get_current_IHelpMessage(): current.IHelpMessage;
set_old_IHelpMessage(get_current_IHelpMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "INack": {"forwardCompat": false}
declare function set_current_INack(set: current.INack);
declare function get_old_INack(): old.INack;
set_current_INack(get_old_INack());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "INack": {"backCompat": false}
declare function set_old_INack(set: old.INack);
declare function get_current_INack(): current.INack;
set_old_INack(get_current_INack());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "INackContent": {"forwardCompat": false}
declare function set_current_INackContent(set: current.INackContent);
declare function get_old_INackContent(): old.INackContent;
set_current_INackContent(get_old_INackContent());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "INackContent": {"backCompat": false}
declare function set_old_INackContent(set: old.INackContent);
declare function get_current_INackContent(): current.INackContent;
set_old_INackContent(get_current_INackContent());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IPendingProposal": {"forwardCompat": false}
declare function set_current_IPendingProposal(set: current.IPendingProposal);
declare function get_old_IPendingProposal(): old.IPendingProposal;
set_current_IPendingProposal(get_old_IPendingProposal());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IPendingProposal": {"backCompat": false}
declare function set_old_IPendingProposal(set: old.IPendingProposal);
declare function get_current_IPendingProposal(): current.IPendingProposal;
set_old_IPendingProposal(get_current_IPendingProposal());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IProcessMessageResult": {"forwardCompat": false}
declare function set_current_IProcessMessageResult(set: current.IProcessMessageResult);
declare function get_old_IProcessMessageResult(): old.IProcessMessageResult;
set_current_IProcessMessageResult(get_old_IProcessMessageResult());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IProcessMessageResult": {"backCompat": false}
declare function set_old_IProcessMessageResult(set: old.IProcessMessageResult);
declare function get_current_IProcessMessageResult(): current.IProcessMessageResult;
set_old_IProcessMessageResult(get_current_IProcessMessageResult());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IProposal": {"forwardCompat": false}
declare function set_current_IProposal(set: current.IProposal);
declare function get_old_IProposal(): old.IProposal;
set_current_IProposal(get_old_IProposal());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IProposal": {"backCompat": false}
declare function set_old_IProposal(set: old.IProposal);
declare function get_current_IProposal(): current.IProposal;
set_old_IProposal(get_current_IProposal());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IProtocolState": {"forwardCompat": false}
declare function set_current_IProtocolState(set: current.IProtocolState);
declare function get_old_IProtocolState(): old.IProtocolState;
set_current_IProtocolState(get_old_IProtocolState());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IProtocolState": {"backCompat": false}
declare function set_old_IProtocolState(set: old.IProtocolState);
declare function get_current_IProtocolState(): current.IProtocolState;
set_old_IProtocolState(get_current_IProtocolState());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IQueueMessage": {"forwardCompat": false}
declare function set_current_IQueueMessage(set: current.IQueueMessage);
declare function get_old_IQueueMessage(): old.IQueueMessage;
set_current_IQueueMessage(get_old_IQueueMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IQueueMessage": {"backCompat": false}
declare function set_old_IQueueMessage(set: old.IQueueMessage);
declare function get_current_IQueueMessage(): current.IQueueMessage;
set_old_IQueueMessage(get_current_IQueueMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IQuorum": {"backCompat": false}
declare function set_old_IQuorum(set: old.IQuorum);
declare function get_current_IQuorum(): current.IQuorum;
set_old_IQuorum(get_current_IQuorum());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IQuorumEvents": {"forwardCompat": false}
declare function set_current_IQuorumEvents(set: current.IQuorumEvents);
declare function get_old_IQuorumEvents(): old.IQuorumEvents;
set_current_IQuorumEvents(get_old_IQuorumEvents());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IQuorumEvents": {"backCompat": false}
declare function set_old_IQuorumEvents(set: old.IQuorumEvents);
declare function get_current_IQuorumEvents(): current.IQuorumEvents;
set_old_IQuorumEvents(get_current_IQuorumEvents());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISequencedClient": {"forwardCompat": false}
declare function set_current_ISequencedClient(set: current.ISequencedClient);
declare function get_old_ISequencedClient(): old.ISequencedClient;
set_current_ISequencedClient(get_old_ISequencedClient());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISequencedClient": {"backCompat": false}
declare function set_old_ISequencedClient(set: old.ISequencedClient);
declare function get_current_ISequencedClient(): current.ISequencedClient;
set_old_ISequencedClient(get_current_ISequencedClient());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISequencedDocumentAugmentedMessage": {"forwardCompat": false}
declare function set_current_ISequencedDocumentAugmentedMessage(set: current.ISequencedDocumentAugmentedMessage);
declare function get_old_ISequencedDocumentAugmentedMessage(): old.ISequencedDocumentAugmentedMessage;
set_current_ISequencedDocumentAugmentedMessage(get_old_ISequencedDocumentAugmentedMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISequencedDocumentAugmentedMessage": {"backCompat": false}
declare function set_old_ISequencedDocumentAugmentedMessage(set: old.ISequencedDocumentAugmentedMessage);
declare function get_current_ISequencedDocumentAugmentedMessage(): current.ISequencedDocumentAugmentedMessage;
set_old_ISequencedDocumentAugmentedMessage(get_current_ISequencedDocumentAugmentedMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISequencedDocumentMessage": {"forwardCompat": false}
declare function set_current_ISequencedDocumentMessage(set: current.ISequencedDocumentMessage);
declare function get_old_ISequencedDocumentMessage(): old.ISequencedDocumentMessage;
set_current_ISequencedDocumentMessage(get_old_ISequencedDocumentMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISequencedDocumentMessage": {"backCompat": false}
declare function set_old_ISequencedDocumentMessage(set: old.ISequencedDocumentMessage);
declare function get_current_ISequencedDocumentMessage(): current.ISequencedDocumentMessage;
set_old_ISequencedDocumentMessage(get_current_ISequencedDocumentMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISequencedDocumentSystemMessage": {"forwardCompat": false}
declare function set_current_ISequencedDocumentSystemMessage(set: current.ISequencedDocumentSystemMessage);
declare function get_old_ISequencedDocumentSystemMessage(): old.ISequencedDocumentSystemMessage;
set_current_ISequencedDocumentSystemMessage(get_old_ISequencedDocumentSystemMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISequencedDocumentSystemMessage": {"backCompat": false}
declare function set_old_ISequencedDocumentSystemMessage(set: old.ISequencedDocumentSystemMessage);
declare function get_current_ISequencedDocumentSystemMessage(): current.ISequencedDocumentSystemMessage;
set_old_ISequencedDocumentSystemMessage(get_current_ISequencedDocumentSystemMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISequencedProposal": {"forwardCompat": false}
declare function set_current_ISequencedProposal(set: current.ISequencedProposal);
declare function get_old_ISequencedProposal(): old.ISequencedProposal;
set_current_ISequencedProposal(get_old_ISequencedProposal());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISequencedProposal": {"backCompat": false}
declare function set_old_ISequencedProposal(set: old.ISequencedProposal);
declare function get_current_ISequencedProposal(): current.ISequencedProposal;
set_old_ISequencedProposal(get_current_ISequencedProposal());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IServerError": {"forwardCompat": false}
declare function set_current_IServerError(set: current.IServerError);
declare function get_old_IServerError(): old.IServerError;
set_current_IServerError(get_old_IServerError());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IServerError": {"backCompat": false}
declare function set_old_IServerError(set: old.IServerError);
declare function get_current_IServerError(): current.IServerError;
set_old_IServerError(get_current_IServerError());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISignalClient": {"forwardCompat": false}
declare function set_current_ISignalClient(set: current.ISignalClient);
declare function get_old_ISignalClient(): old.ISignalClient;
set_current_ISignalClient(get_old_ISignalClient());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISignalClient": {"backCompat": false}
declare function set_old_ISignalClient(set: old.ISignalClient);
declare function get_current_ISignalClient(): current.ISignalClient;
set_old_ISignalClient(get_current_ISignalClient());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISignalMessage": {"forwardCompat": false}
declare function set_current_ISignalMessage(set: current.ISignalMessage);
declare function get_old_ISignalMessage(): old.ISignalMessage;
set_current_ISignalMessage(get_old_ISignalMessage());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISignalMessage": {"backCompat": false}
declare function set_old_ISignalMessage(set: old.ISignalMessage);
declare function get_current_ISignalMessage(): current.ISignalMessage;
set_old_ISignalMessage(get_current_ISignalMessage());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISnapshotTree": {"forwardCompat": false}
declare function set_current_ISnapshotTree(set: current.ISnapshotTree);
declare function get_old_ISnapshotTree(): old.ISnapshotTree;
set_current_ISnapshotTree(get_old_ISnapshotTree());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISnapshotTree": {"backCompat": false}
declare function set_old_ISnapshotTree(set: old.ISnapshotTree);
declare function get_current_ISnapshotTree(): current.ISnapshotTree;
set_old_ISnapshotTree(get_current_ISnapshotTree());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISnapshotTreeEx": {"forwardCompat": false}
declare function set_current_ISnapshotTreeEx(set: current.ISnapshotTreeEx);
declare function get_old_ISnapshotTreeEx(): old.ISnapshotTreeEx;
set_current_ISnapshotTreeEx(get_old_ISnapshotTreeEx());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISnapshotTreeEx": {"backCompat": false}
declare function set_old_ISnapshotTreeEx(set: old.ISnapshotTreeEx);
declare function get_current_ISnapshotTreeEx(): current.ISnapshotTreeEx;
set_old_ISnapshotTreeEx(get_current_ISnapshotTreeEx());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryAck": {"forwardCompat": false}
declare function set_current_ISummaryAck(set: current.ISummaryAck);
declare function get_old_ISummaryAck(): old.ISummaryAck;
set_current_ISummaryAck(get_old_ISummaryAck());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryAck": {"backCompat": false}
declare function set_old_ISummaryAck(set: old.ISummaryAck);
declare function get_current_ISummaryAck(): current.ISummaryAck;
set_old_ISummaryAck(get_current_ISummaryAck());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryAuthor": {"forwardCompat": false}
declare function set_current_ISummaryAuthor(set: current.ISummaryAuthor);
declare function get_old_ISummaryAuthor(): old.ISummaryAuthor;
set_current_ISummaryAuthor(get_old_ISummaryAuthor());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryAuthor": {"backCompat": false}
declare function set_old_ISummaryAuthor(set: old.ISummaryAuthor);
declare function get_current_ISummaryAuthor(): current.ISummaryAuthor;
set_old_ISummaryAuthor(get_current_ISummaryAuthor());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryCommitter": {"forwardCompat": false}
declare function set_current_ISummaryCommitter(set: current.ISummaryCommitter);
declare function get_old_ISummaryCommitter(): old.ISummaryCommitter;
set_current_ISummaryCommitter(get_old_ISummaryCommitter());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryCommitter": {"backCompat": false}
declare function set_old_ISummaryCommitter(set: old.ISummaryCommitter);
declare function get_current_ISummaryCommitter(): current.ISummaryCommitter;
set_old_ISummaryCommitter(get_current_ISummaryCommitter());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryConfiguration": {"forwardCompat": false}
declare function set_current_ISummaryConfiguration(set: current.ISummaryConfiguration);
declare function get_old_ISummaryConfiguration(): old.ISummaryConfiguration;
set_current_ISummaryConfiguration(get_old_ISummaryConfiguration());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryConfiguration": {"backCompat": false}
declare function set_old_ISummaryConfiguration(set: old.ISummaryConfiguration);
declare function get_current_ISummaryConfiguration(): current.ISummaryConfiguration;
set_old_ISummaryConfiguration(get_current_ISummaryConfiguration());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryContent": {"forwardCompat": false}
declare function set_current_ISummaryContent(set: current.ISummaryContent);
declare function get_old_ISummaryContent(): old.ISummaryContent;
set_current_ISummaryContent(get_old_ISummaryContent());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryContent": {"backCompat": false}
declare function set_old_ISummaryContent(set: old.ISummaryContent);
declare function get_current_ISummaryContent(): current.ISummaryContent;
set_old_ISummaryContent(get_current_ISummaryContent());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryNack": {"forwardCompat": false}
declare function set_current_ISummaryNack(set: current.ISummaryNack);
declare function get_old_ISummaryNack(): old.ISummaryNack;
set_current_ISummaryNack(get_old_ISummaryNack());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryNack": {"backCompat": false}
declare function set_old_ISummaryNack(set: old.ISummaryNack);
declare function get_current_ISummaryNack(): current.ISummaryNack;
set_old_ISummaryNack(get_current_ISummaryNack());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryProposal": {"forwardCompat": false}
declare function set_current_ISummaryProposal(set: current.ISummaryProposal);
declare function get_old_ISummaryProposal(): old.ISummaryProposal;
set_current_ISummaryProposal(get_old_ISummaryProposal());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryProposal": {"backCompat": false}
declare function set_old_ISummaryProposal(set: old.ISummaryProposal);
declare function get_current_ISummaryProposal(): current.ISummaryProposal;
set_old_ISummaryProposal(get_current_ISummaryProposal());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ISummaryTokenClaims": {"forwardCompat": false}
declare function set_current_ISummaryTokenClaims(set: current.ISummaryTokenClaims);
declare function get_old_ISummaryTokenClaims(): old.ISummaryTokenClaims;
set_current_ISummaryTokenClaims(get_old_ISummaryTokenClaims());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ISummaryTokenClaims": {"backCompat": false}
declare function set_old_ISummaryTokenClaims(set: old.ISummaryTokenClaims);
declare function get_current_ISummaryTokenClaims(): current.ISummaryTokenClaims;
set_old_ISummaryTokenClaims(get_current_ISummaryTokenClaims());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ITokenClaims": {"forwardCompat": false}
declare function set_current_ITokenClaims(set: current.ITokenClaims);
declare function get_old_ITokenClaims(): old.ITokenClaims;
set_current_ITokenClaims(get_old_ITokenClaims());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ITokenClaims": {"backCompat": false}
declare function set_old_ITokenClaims(set: old.ITokenClaims);
declare function get_current_ITokenClaims(): current.ITokenClaims;
set_old_ITokenClaims(get_current_ITokenClaims());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ITokenProvider": {"forwardCompat": false}
declare function set_current_ITokenProvider(set: current.ITokenProvider);
declare function get_old_ITokenProvider(): old.ITokenProvider;
set_current_ITokenProvider(get_old_ITokenProvider());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ITokenProvider": {"backCompat": false}
declare function set_old_ITokenProvider(set: old.ITokenProvider);
declare function get_current_ITokenProvider(): current.ITokenProvider;
set_old_ITokenProvider(get_current_ITokenProvider());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ITokenService": {"forwardCompat": false}
declare function set_current_ITokenService(set: current.ITokenService);
declare function get_old_ITokenService(): old.ITokenService;
set_current_ITokenService(get_old_ITokenService());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ITokenService": {"backCompat": false}
declare function set_old_ITokenService(set: old.ITokenService);
declare function get_current_ITokenService(): current.ITokenService;
set_old_ITokenService(get_current_ITokenService());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ITrace": {"forwardCompat": false}
declare function set_current_ITrace(set: current.ITrace);
declare function get_old_ITrace(): old.ITrace;
set_current_ITrace(get_old_ITrace());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ITrace": {"backCompat": false}
declare function set_old_ITrace(set: old.ITrace);
declare function get_current_ITrace(): current.ITrace;
set_old_ITrace(get_current_ITrace());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ITree": {"forwardCompat": false}
declare function set_current_ITree(set: current.ITree);
declare function get_old_ITree(): old.ITree;
set_current_ITree(get_old_ITree());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ITree": {"backCompat": false}
declare function set_old_ITree(set: old.ITree);
declare function get_current_ITree(): current.ITree;
set_old_ITree(get_current_ITree());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ITreeEntry": {"forwardCompat": false}
declare function set_current_ITreeEntry(set: current.ITreeEntry);
declare function get_old_ITreeEntry(): old.ITreeEntry;
set_current_ITreeEntry(get_old_ITreeEntry());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ITreeEntry": {"backCompat": false}
declare function set_old_ITreeEntry(set: old.ITreeEntry);
declare function get_current_ITreeEntry(): current.ITreeEntry;
set_old_ITreeEntry(get_current_ITreeEntry());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IUploadedSummaryDetails": {"forwardCompat": false}
declare function set_current_IUploadedSummaryDetails(set: current.IUploadedSummaryDetails);
declare function get_old_IUploadedSummaryDetails(): old.IUploadedSummaryDetails;
set_current_IUploadedSummaryDetails(get_old_IUploadedSummaryDetails());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IUploadedSummaryDetails": {"backCompat": false}
declare function set_old_IUploadedSummaryDetails(set: old.IUploadedSummaryDetails);
declare function get_current_IUploadedSummaryDetails(): current.IUploadedSummaryDetails;
set_old_IUploadedSummaryDetails(get_current_IUploadedSummaryDetails());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IUser": {"forwardCompat": false}
declare function set_current_IUser(set: current.IUser);
declare function get_old_IUser(): old.IUser;
set_current_IUser(get_old_IUser());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IUser": {"backCompat": false}
declare function set_old_IUser(set: old.IUser);
declare function get_current_IUser(): current.IUser;
set_old_IUser(get_current_IUser());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "IVersion": {"forwardCompat": false}
declare function set_current_IVersion(set: current.IVersion);
declare function get_old_IVersion(): old.IVersion;
set_current_IVersion(get_old_IVersion());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "IVersion": {"backCompat": false}
declare function set_old_IVersion(set: old.IVersion);
declare function get_current_IVersion(): current.IVersion;
set_old_IVersion(get_current_IVersion());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "MessageType": {"forwardCompat": false}
declare function set_current_MessageType(set: current.MessageType);
declare function get_old_MessageType(): old.MessageType;
set_current_MessageType(get_old_MessageType());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "MessageType": {"backCompat": false}
declare function set_old_MessageType(set: old.MessageType);
declare function get_current_MessageType(): current.MessageType;
set_old_MessageType(get_current_MessageType());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "NackErrorType": {"forwardCompat": false}
declare function set_current_NackErrorType(set: current.NackErrorType);
declare function get_old_NackErrorType(): old.NackErrorType;
set_current_NackErrorType(get_old_NackErrorType());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "NackErrorType": {"backCompat": false}
declare function set_old_NackErrorType(set: old.NackErrorType);
declare function get_current_NackErrorType(): current.NackErrorType;
set_old_NackErrorType(get_current_NackErrorType());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "ScopeType": {"forwardCompat": false}
declare function set_current_ScopeType(set: current.ScopeType);
declare function get_old_ScopeType(): old.ScopeType;
set_current_ScopeType(get_old_ScopeType());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "ScopeType": {"backCompat": false}
declare function set_old_ScopeType(set: old.ScopeType);
declare function get_current_ScopeType(): current.ScopeType;
set_old_ScopeType(get_current_ScopeType());

// validate forward comapt of old type to new type
// disable in package.json under typeValidation.broken:
// "TreeEntry": {"forwardCompat": false}
declare function set_current_TreeEntry(set: current.TreeEntry);
declare function get_old_TreeEntry(): old.TreeEntry;
set_current_TreeEntry(get_old_TreeEntry());

// validate backward comapt of new type to old type
// disable in package.json under typeValidation.broken:
// "TreeEntry": {"backCompat": false}
declare function set_old_TreeEntry(set: old.TreeEntry);
declare function get_current_TreeEntry(): current.TreeEntry;
set_old_TreeEntry(get_current_TreeEntry());
