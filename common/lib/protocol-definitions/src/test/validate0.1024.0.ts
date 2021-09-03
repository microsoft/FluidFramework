/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as old from "@fluidframework/protocol-definitions-0.1024.0";
import * as current from "../index";

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ConnectionMode": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_ConnectionMode():
    old.ConnectionMode;
declare function use_current_TypeAliasDeclaration_ConnectionMode(
    use: current.ConnectionMode);
use_current_TypeAliasDeclaration_ConnectionMode(
    get_old_TypeAliasDeclaration_ConnectionMode());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ConnectionMode": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_ConnectionMode():
    current.ConnectionMode;
declare function use_old_TypeAliasDeclaration_ConnectionMode(
    use: old.ConnectionMode);
use_old_TypeAliasDeclaration_ConnectionMode(
    get_current_TypeAliasDeclaration_ConnectionMode());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_FileMode": {"forwardCompat": false}
*/
declare function get_old_EnumDeclaration_FileMode():
    old.FileMode;
declare function use_current_EnumDeclaration_FileMode(
    use: current.FileMode);
use_current_EnumDeclaration_FileMode(
    get_old_EnumDeclaration_FileMode());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_FileMode": {"backCompat": false}
*/
declare function get_current_EnumDeclaration_FileMode():
    current.FileMode;
declare function use_old_EnumDeclaration_FileMode(
    use: old.FileMode);
use_old_EnumDeclaration_FileMode(
    get_current_EnumDeclaration_FileMode());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IActorClient": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IActorClient():
    old.IActorClient;
declare function use_current_InterfaceDeclaration_IActorClient(
    use: current.IActorClient);
use_current_InterfaceDeclaration_IActorClient(
    get_old_InterfaceDeclaration_IActorClient());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IActorClient": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IActorClient():
    current.IActorClient;
declare function use_old_InterfaceDeclaration_IActorClient(
    use: old.IActorClient);
use_old_InterfaceDeclaration_IActorClient(
    get_current_InterfaceDeclaration_IActorClient());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_IApprovedProposal": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_IApprovedProposal():
    old.IApprovedProposal;
declare function use_current_TypeAliasDeclaration_IApprovedProposal(
    use: current.IApprovedProposal);
use_current_TypeAliasDeclaration_IApprovedProposal(
    get_old_TypeAliasDeclaration_IApprovedProposal());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_IApprovedProposal": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_IApprovedProposal():
    current.IApprovedProposal;
declare function use_old_TypeAliasDeclaration_IApprovedProposal(
    use: old.IApprovedProposal);
use_old_TypeAliasDeclaration_IApprovedProposal(
    get_current_TypeAliasDeclaration_IApprovedProposal());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IAttachment": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IAttachment():
    old.IAttachment;
declare function use_current_InterfaceDeclaration_IAttachment(
    use: current.IAttachment);
use_current_InterfaceDeclaration_IAttachment(
    get_old_InterfaceDeclaration_IAttachment());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IAttachment": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IAttachment():
    current.IAttachment;
declare function use_old_InterfaceDeclaration_IAttachment(
    use: old.IAttachment);
use_old_InterfaceDeclaration_IAttachment(
    get_current_InterfaceDeclaration_IAttachment());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IBlob": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IBlob():
    old.IBlob;
declare function use_current_InterfaceDeclaration_IBlob(
    use: current.IBlob);
use_current_InterfaceDeclaration_IBlob(
    get_old_InterfaceDeclaration_IBlob());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IBlob": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IBlob():
    current.IBlob;
declare function use_old_InterfaceDeclaration_IBlob(
    use: old.IBlob);
use_old_InterfaceDeclaration_IBlob(
    get_current_InterfaceDeclaration_IBlob());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IBranchOrigin": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IBranchOrigin():
    old.IBranchOrigin;
declare function use_current_InterfaceDeclaration_IBranchOrigin(
    use: current.IBranchOrigin);
use_current_InterfaceDeclaration_IBranchOrigin(
    get_old_InterfaceDeclaration_IBranchOrigin());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IBranchOrigin": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IBranchOrigin():
    current.IBranchOrigin;
declare function use_old_InterfaceDeclaration_IBranchOrigin(
    use: old.IBranchOrigin);
use_old_InterfaceDeclaration_IBranchOrigin(
    get_current_InterfaceDeclaration_IBranchOrigin());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICapabilities": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ICapabilities():
    old.ICapabilities;
declare function use_current_InterfaceDeclaration_ICapabilities(
    use: current.ICapabilities);
use_current_InterfaceDeclaration_ICapabilities(
    get_old_InterfaceDeclaration_ICapabilities());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICapabilities": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ICapabilities():
    current.ICapabilities;
declare function use_old_InterfaceDeclaration_ICapabilities(
    use: old.ICapabilities);
use_old_InterfaceDeclaration_ICapabilities(
    get_current_InterfaceDeclaration_ICapabilities());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClient": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IClient():
    old.IClient;
declare function use_current_InterfaceDeclaration_IClient(
    use: current.IClient);
use_current_InterfaceDeclaration_IClient(
    get_old_InterfaceDeclaration_IClient());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClient": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IClient():
    current.IClient;
declare function use_old_InterfaceDeclaration_IClient(
    use: old.IClient);
use_old_InterfaceDeclaration_IClient(
    get_current_InterfaceDeclaration_IClient());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClientConfiguration": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IClientConfiguration():
    old.IClientConfiguration;
declare function use_current_InterfaceDeclaration_IClientConfiguration(
    use: current.IClientConfiguration);
use_current_InterfaceDeclaration_IClientConfiguration(
    get_old_InterfaceDeclaration_IClientConfiguration());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClientConfiguration": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IClientConfiguration():
    current.IClientConfiguration;
declare function use_old_InterfaceDeclaration_IClientConfiguration(
    use: old.IClientConfiguration);
use_old_InterfaceDeclaration_IClientConfiguration(
    get_current_InterfaceDeclaration_IClientConfiguration());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClientDetails": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IClientDetails():
    old.IClientDetails;
declare function use_current_InterfaceDeclaration_IClientDetails(
    use: current.IClientDetails);
use_current_InterfaceDeclaration_IClientDetails(
    get_old_InterfaceDeclaration_IClientDetails());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClientDetails": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IClientDetails():
    current.IClientDetails;
declare function use_old_InterfaceDeclaration_IClientDetails(
    use: old.IClientDetails);
use_old_InterfaceDeclaration_IClientDetails(
    get_current_InterfaceDeclaration_IClientDetails());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClientJoin": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IClientJoin():
    old.IClientJoin;
declare function use_current_InterfaceDeclaration_IClientJoin(
    use: current.IClientJoin);
use_current_InterfaceDeclaration_IClientJoin(
    get_old_InterfaceDeclaration_IClientJoin());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IClientJoin": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IClientJoin():
    current.IClientJoin;
declare function use_old_InterfaceDeclaration_IClientJoin(
    use: old.IClientJoin);
use_old_InterfaceDeclaration_IClientJoin(
    get_current_InterfaceDeclaration_IClientJoin());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ICommittedProposal": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_ICommittedProposal():
    old.ICommittedProposal;
declare function use_current_TypeAliasDeclaration_ICommittedProposal(
    use: current.ICommittedProposal);
use_current_TypeAliasDeclaration_ICommittedProposal(
    get_old_TypeAliasDeclaration_ICommittedProposal());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ICommittedProposal": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_ICommittedProposal():
    current.ICommittedProposal;
declare function use_old_TypeAliasDeclaration_ICommittedProposal(
    use: old.ICommittedProposal);
use_old_TypeAliasDeclaration_ICommittedProposal(
    get_current_TypeAliasDeclaration_ICommittedProposal());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IConnect": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IConnect():
    old.IConnect;
declare function use_current_InterfaceDeclaration_IConnect(
    use: current.IConnect);
use_current_InterfaceDeclaration_IConnect(
    get_old_InterfaceDeclaration_IConnect());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IConnect": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IConnect():
    current.IConnect;
declare function use_old_InterfaceDeclaration_IConnect(
    use: old.IConnect);
use_old_InterfaceDeclaration_IConnect(
    get_current_InterfaceDeclaration_IConnect());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IConnected": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IConnected():
    old.IConnected;
declare function use_current_InterfaceDeclaration_IConnected(
    use: current.IConnected);
use_current_InterfaceDeclaration_IConnected(
    get_old_InterfaceDeclaration_IConnected());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IConnected": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IConnected():
    current.IConnected;
declare function use_old_InterfaceDeclaration_IConnected(
    use: old.IConnected);
use_old_InterfaceDeclaration_IConnected(
    get_current_InterfaceDeclaration_IConnected());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICreateBlobResponse": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ICreateBlobResponse():
    old.ICreateBlobResponse;
declare function use_current_InterfaceDeclaration_ICreateBlobResponse(
    use: current.ICreateBlobResponse);
use_current_InterfaceDeclaration_ICreateBlobResponse(
    get_old_InterfaceDeclaration_ICreateBlobResponse());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ICreateBlobResponse": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ICreateBlobResponse():
    current.ICreateBlobResponse;
declare function use_old_InterfaceDeclaration_ICreateBlobResponse(
    use: old.ICreateBlobResponse);
use_old_InterfaceDeclaration_ICreateBlobResponse(
    get_current_InterfaceDeclaration_ICreateBlobResponse());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDocumentAttributes": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IDocumentAttributes():
    old.IDocumentAttributes;
declare function use_current_InterfaceDeclaration_IDocumentAttributes(
    use: current.IDocumentAttributes);
use_current_InterfaceDeclaration_IDocumentAttributes(
    get_old_InterfaceDeclaration_IDocumentAttributes());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDocumentAttributes": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IDocumentAttributes():
    current.IDocumentAttributes;
declare function use_old_InterfaceDeclaration_IDocumentAttributes(
    use: old.IDocumentAttributes);
use_old_InterfaceDeclaration_IDocumentAttributes(
    get_current_InterfaceDeclaration_IDocumentAttributes());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDocumentMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IDocumentMessage():
    old.IDocumentMessage;
declare function use_current_InterfaceDeclaration_IDocumentMessage(
    use: current.IDocumentMessage);
use_current_InterfaceDeclaration_IDocumentMessage(
    get_old_InterfaceDeclaration_IDocumentMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDocumentMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IDocumentMessage():
    current.IDocumentMessage;
declare function use_old_InterfaceDeclaration_IDocumentMessage(
    use: old.IDocumentMessage);
use_old_InterfaceDeclaration_IDocumentMessage(
    get_current_InterfaceDeclaration_IDocumentMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDocumentSystemMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IDocumentSystemMessage():
    old.IDocumentSystemMessage;
declare function use_current_InterfaceDeclaration_IDocumentSystemMessage(
    use: current.IDocumentSystemMessage);
use_current_InterfaceDeclaration_IDocumentSystemMessage(
    get_old_InterfaceDeclaration_IDocumentSystemMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IDocumentSystemMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IDocumentSystemMessage():
    current.IDocumentSystemMessage;
declare function use_old_InterfaceDeclaration_IDocumentSystemMessage(
    use: old.IDocumentSystemMessage);
use_old_InterfaceDeclaration_IDocumentSystemMessage(
    get_current_InterfaceDeclaration_IDocumentSystemMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IHelpMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IHelpMessage():
    old.IHelpMessage;
declare function use_current_InterfaceDeclaration_IHelpMessage(
    use: current.IHelpMessage);
use_current_InterfaceDeclaration_IHelpMessage(
    get_old_InterfaceDeclaration_IHelpMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IHelpMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IHelpMessage():
    current.IHelpMessage;
declare function use_old_InterfaceDeclaration_IHelpMessage(
    use: old.IHelpMessage);
use_old_InterfaceDeclaration_IHelpMessage(
    get_current_InterfaceDeclaration_IHelpMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_INack": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_INack():
    old.INack;
declare function use_current_InterfaceDeclaration_INack(
    use: current.INack);
use_current_InterfaceDeclaration_INack(
    get_old_InterfaceDeclaration_INack());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_INack": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_INack():
    current.INack;
declare function use_old_InterfaceDeclaration_INack(
    use: old.INack);
use_old_InterfaceDeclaration_INack(
    get_current_InterfaceDeclaration_INack());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_INackContent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_INackContent():
    old.INackContent;
declare function use_current_InterfaceDeclaration_INackContent(
    use: current.INackContent);
use_current_InterfaceDeclaration_INackContent(
    get_old_InterfaceDeclaration_INackContent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_INackContent": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_INackContent():
    current.INackContent;
declare function use_old_InterfaceDeclaration_INackContent(
    use: old.INackContent);
use_old_InterfaceDeclaration_INackContent(
    get_current_InterfaceDeclaration_INackContent());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IPendingProposal": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IPendingProposal():
    old.IPendingProposal;
declare function use_current_InterfaceDeclaration_IPendingProposal(
    use: current.IPendingProposal);
use_current_InterfaceDeclaration_IPendingProposal(
    get_old_InterfaceDeclaration_IPendingProposal());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IPendingProposal": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IPendingProposal():
    current.IPendingProposal;
declare function use_old_InterfaceDeclaration_IPendingProposal(
    use: old.IPendingProposal);
use_old_InterfaceDeclaration_IPendingProposal(
    get_current_InterfaceDeclaration_IPendingProposal());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProcessMessageResult": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IProcessMessageResult():
    old.IProcessMessageResult;
declare function use_current_InterfaceDeclaration_IProcessMessageResult(
    use: current.IProcessMessageResult);
use_current_InterfaceDeclaration_IProcessMessageResult(
    get_old_InterfaceDeclaration_IProcessMessageResult());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProcessMessageResult": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IProcessMessageResult():
    current.IProcessMessageResult;
declare function use_old_InterfaceDeclaration_IProcessMessageResult(
    use: old.IProcessMessageResult);
use_old_InterfaceDeclaration_IProcessMessageResult(
    get_current_InterfaceDeclaration_IProcessMessageResult());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProposal": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IProposal():
    old.IProposal;
declare function use_current_InterfaceDeclaration_IProposal(
    use: current.IProposal);
use_current_InterfaceDeclaration_IProposal(
    get_old_InterfaceDeclaration_IProposal());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProposal": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IProposal():
    current.IProposal;
declare function use_old_InterfaceDeclaration_IProposal(
    use: old.IProposal);
use_old_InterfaceDeclaration_IProposal(
    get_current_InterfaceDeclaration_IProposal());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProtocolState": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IProtocolState():
    old.IProtocolState;
declare function use_current_InterfaceDeclaration_IProtocolState(
    use: current.IProtocolState);
use_current_InterfaceDeclaration_IProtocolState(
    get_old_InterfaceDeclaration_IProtocolState());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IProtocolState": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IProtocolState():
    current.IProtocolState;
declare function use_old_InterfaceDeclaration_IProtocolState(
    use: old.IProtocolState);
use_old_InterfaceDeclaration_IProtocolState(
    get_current_InterfaceDeclaration_IProtocolState());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IQueueMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IQueueMessage():
    old.IQueueMessage;
declare function use_current_InterfaceDeclaration_IQueueMessage(
    use: current.IQueueMessage);
use_current_InterfaceDeclaration_IQueueMessage(
    get_old_InterfaceDeclaration_IQueueMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IQueueMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IQueueMessage():
    current.IQueueMessage;
declare function use_old_InterfaceDeclaration_IQueueMessage(
    use: old.IQueueMessage);
use_old_InterfaceDeclaration_IQueueMessage(
    get_current_InterfaceDeclaration_IQueueMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IQuorum": {"forwardCompat": false}
declare function get_old_InterfaceDeclaration_IQuorum():
    old.IQuorum;
declare function use_current_InterfaceDeclaration_IQuorum(
    use: current.IQuorum);
use_current_InterfaceDeclaration_IQuorum(
    get_old_InterfaceDeclaration_IQuorum());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IQuorum": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IQuorum():
    current.IQuorum;
declare function use_old_InterfaceDeclaration_IQuorum(
    use: old.IQuorum);
use_old_InterfaceDeclaration_IQuorum(
    get_current_InterfaceDeclaration_IQuorum());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedClient": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISequencedClient():
    old.ISequencedClient;
declare function use_current_InterfaceDeclaration_ISequencedClient(
    use: current.ISequencedClient);
use_current_InterfaceDeclaration_ISequencedClient(
    get_old_InterfaceDeclaration_ISequencedClient());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedClient": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISequencedClient():
    current.ISequencedClient;
declare function use_old_InterfaceDeclaration_ISequencedClient(
    use: old.ISequencedClient);
use_old_InterfaceDeclaration_ISequencedClient(
    get_current_InterfaceDeclaration_ISequencedClient());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedDocumentAugmentedMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISequencedDocumentAugmentedMessage():
    old.ISequencedDocumentAugmentedMessage;
declare function use_current_InterfaceDeclaration_ISequencedDocumentAugmentedMessage(
    use: current.ISequencedDocumentAugmentedMessage);
use_current_InterfaceDeclaration_ISequencedDocumentAugmentedMessage(
    get_old_InterfaceDeclaration_ISequencedDocumentAugmentedMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedDocumentAugmentedMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISequencedDocumentAugmentedMessage():
    current.ISequencedDocumentAugmentedMessage;
declare function use_old_InterfaceDeclaration_ISequencedDocumentAugmentedMessage(
    use: old.ISequencedDocumentAugmentedMessage);
use_old_InterfaceDeclaration_ISequencedDocumentAugmentedMessage(
    get_current_InterfaceDeclaration_ISequencedDocumentAugmentedMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedDocumentMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISequencedDocumentMessage():
    old.ISequencedDocumentMessage;
declare function use_current_InterfaceDeclaration_ISequencedDocumentMessage(
    use: current.ISequencedDocumentMessage);
use_current_InterfaceDeclaration_ISequencedDocumentMessage(
    get_old_InterfaceDeclaration_ISequencedDocumentMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedDocumentMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISequencedDocumentMessage():
    current.ISequencedDocumentMessage;
declare function use_old_InterfaceDeclaration_ISequencedDocumentMessage(
    use: old.ISequencedDocumentMessage);
use_old_InterfaceDeclaration_ISequencedDocumentMessage(
    get_current_InterfaceDeclaration_ISequencedDocumentMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedDocumentSystemMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISequencedDocumentSystemMessage():
    old.ISequencedDocumentSystemMessage;
declare function use_current_InterfaceDeclaration_ISequencedDocumentSystemMessage(
    use: current.ISequencedDocumentSystemMessage);
use_current_InterfaceDeclaration_ISequencedDocumentSystemMessage(
    get_old_InterfaceDeclaration_ISequencedDocumentSystemMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISequencedDocumentSystemMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISequencedDocumentSystemMessage():
    current.ISequencedDocumentSystemMessage;
declare function use_old_InterfaceDeclaration_ISequencedDocumentSystemMessage(
    use: old.ISequencedDocumentSystemMessage);
use_old_InterfaceDeclaration_ISequencedDocumentSystemMessage(
    get_current_InterfaceDeclaration_ISequencedDocumentSystemMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ISequencedProposal": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_ISequencedProposal():
    old.ISequencedProposal;
declare function use_current_TypeAliasDeclaration_ISequencedProposal(
    use: current.ISequencedProposal);
use_current_TypeAliasDeclaration_ISequencedProposal(
    get_old_TypeAliasDeclaration_ISequencedProposal());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ISequencedProposal": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_ISequencedProposal():
    current.ISequencedProposal;
declare function use_old_TypeAliasDeclaration_ISequencedProposal(
    use: old.ISequencedProposal);
use_old_TypeAliasDeclaration_ISequencedProposal(
    get_current_TypeAliasDeclaration_ISequencedProposal());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IServerError": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IServerError():
    old.IServerError;
declare function use_current_InterfaceDeclaration_IServerError(
    use: current.IServerError);
use_current_InterfaceDeclaration_IServerError(
    get_old_InterfaceDeclaration_IServerError());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IServerError": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IServerError():
    current.IServerError;
declare function use_old_InterfaceDeclaration_IServerError(
    use: old.IServerError);
use_old_InterfaceDeclaration_IServerError(
    get_current_InterfaceDeclaration_IServerError());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISignalClient": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISignalClient():
    old.ISignalClient;
declare function use_current_InterfaceDeclaration_ISignalClient(
    use: current.ISignalClient);
use_current_InterfaceDeclaration_ISignalClient(
    get_old_InterfaceDeclaration_ISignalClient());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISignalClient": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISignalClient():
    current.ISignalClient;
declare function use_old_InterfaceDeclaration_ISignalClient(
    use: old.ISignalClient);
use_old_InterfaceDeclaration_ISignalClient(
    get_current_InterfaceDeclaration_ISignalClient());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISignalMessage": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISignalMessage():
    old.ISignalMessage;
declare function use_current_InterfaceDeclaration_ISignalMessage(
    use: current.ISignalMessage);
use_current_InterfaceDeclaration_ISignalMessage(
    get_old_InterfaceDeclaration_ISignalMessage());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISignalMessage": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISignalMessage():
    current.ISignalMessage;
declare function use_old_InterfaceDeclaration_ISignalMessage(
    use: old.ISignalMessage);
use_old_InterfaceDeclaration_ISignalMessage(
    get_current_InterfaceDeclaration_ISignalMessage());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISnapshotTree": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISnapshotTree():
    old.ISnapshotTree;
declare function use_current_InterfaceDeclaration_ISnapshotTree(
    use: current.ISnapshotTree);
use_current_InterfaceDeclaration_ISnapshotTree(
    get_old_InterfaceDeclaration_ISnapshotTree());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISnapshotTree": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISnapshotTree():
    current.ISnapshotTree;
declare function use_old_InterfaceDeclaration_ISnapshotTree(
    use: old.ISnapshotTree);
use_old_InterfaceDeclaration_ISnapshotTree(
    get_current_InterfaceDeclaration_ISnapshotTree());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISnapshotTreeEx": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISnapshotTreeEx():
    old.ISnapshotTreeEx;
declare function use_current_InterfaceDeclaration_ISnapshotTreeEx(
    use: current.ISnapshotTreeEx);
use_current_InterfaceDeclaration_ISnapshotTreeEx(
    get_old_InterfaceDeclaration_ISnapshotTreeEx());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISnapshotTreeEx": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISnapshotTreeEx():
    current.ISnapshotTreeEx;
declare function use_old_InterfaceDeclaration_ISnapshotTreeEx(
    use: old.ISnapshotTreeEx);
use_old_InterfaceDeclaration_ISnapshotTreeEx(
    get_current_InterfaceDeclaration_ISnapshotTreeEx());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryAck": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryAck():
    old.ISummaryAck;
declare function use_current_InterfaceDeclaration_ISummaryAck(
    use: current.ISummaryAck);
use_current_InterfaceDeclaration_ISummaryAck(
    get_old_InterfaceDeclaration_ISummaryAck());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryAck": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryAck():
    current.ISummaryAck;
declare function use_old_InterfaceDeclaration_ISummaryAck(
    use: old.ISummaryAck);
use_old_InterfaceDeclaration_ISummaryAck(
    get_current_InterfaceDeclaration_ISummaryAck());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryAttachment": {"forwardCompat": false}
declare function get_old_InterfaceDeclaration_ISummaryAttachment():
    old.ISummaryAttachment;
declare function use_current_InterfaceDeclaration_ISummaryAttachment(
    use: current.ISummaryAttachment);
use_current_InterfaceDeclaration_ISummaryAttachment(
    get_old_InterfaceDeclaration_ISummaryAttachment());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryAttachment": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ISummaryAttachment():
    current.ISummaryAttachment;
declare function use_old_InterfaceDeclaration_ISummaryAttachment(
    use: old.ISummaryAttachment);
use_old_InterfaceDeclaration_ISummaryAttachment(
    get_current_InterfaceDeclaration_ISummaryAttachment());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryAuthor": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryAuthor():
    old.ISummaryAuthor;
declare function use_current_InterfaceDeclaration_ISummaryAuthor(
    use: current.ISummaryAuthor);
use_current_InterfaceDeclaration_ISummaryAuthor(
    get_old_InterfaceDeclaration_ISummaryAuthor());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryAuthor": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryAuthor():
    current.ISummaryAuthor;
declare function use_old_InterfaceDeclaration_ISummaryAuthor(
    use: old.ISummaryAuthor);
use_old_InterfaceDeclaration_ISummaryAuthor(
    get_current_InterfaceDeclaration_ISummaryAuthor());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryBlob": {"forwardCompat": false}
declare function get_old_InterfaceDeclaration_ISummaryBlob():
    old.ISummaryBlob;
declare function use_current_InterfaceDeclaration_ISummaryBlob(
    use: current.ISummaryBlob);
use_current_InterfaceDeclaration_ISummaryBlob(
    get_old_InterfaceDeclaration_ISummaryBlob());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryBlob": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ISummaryBlob():
    current.ISummaryBlob;
declare function use_old_InterfaceDeclaration_ISummaryBlob(
    use: old.ISummaryBlob);
use_old_InterfaceDeclaration_ISummaryBlob(
    get_current_InterfaceDeclaration_ISummaryBlob());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryCommitter": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryCommitter():
    old.ISummaryCommitter;
declare function use_current_InterfaceDeclaration_ISummaryCommitter(
    use: current.ISummaryCommitter);
use_current_InterfaceDeclaration_ISummaryCommitter(
    get_old_InterfaceDeclaration_ISummaryCommitter());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryCommitter": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryCommitter():
    current.ISummaryCommitter;
declare function use_old_InterfaceDeclaration_ISummaryCommitter(
    use: old.ISummaryCommitter);
use_old_InterfaceDeclaration_ISummaryCommitter(
    get_current_InterfaceDeclaration_ISummaryCommitter());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryConfiguration": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryConfiguration():
    old.ISummaryConfiguration;
declare function use_current_InterfaceDeclaration_ISummaryConfiguration(
    use: current.ISummaryConfiguration);
use_current_InterfaceDeclaration_ISummaryConfiguration(
    get_old_InterfaceDeclaration_ISummaryConfiguration());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryConfiguration": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryConfiguration():
    current.ISummaryConfiguration;
declare function use_old_InterfaceDeclaration_ISummaryConfiguration(
    use: old.ISummaryConfiguration);
use_old_InterfaceDeclaration_ISummaryConfiguration(
    get_current_InterfaceDeclaration_ISummaryConfiguration());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryContent": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryContent():
    old.ISummaryContent;
declare function use_current_InterfaceDeclaration_ISummaryContent(
    use: current.ISummaryContent);
use_current_InterfaceDeclaration_ISummaryContent(
    get_old_InterfaceDeclaration_ISummaryContent());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryContent": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryContent():
    current.ISummaryContent;
declare function use_old_InterfaceDeclaration_ISummaryContent(
    use: old.ISummaryContent);
use_old_InterfaceDeclaration_ISummaryContent(
    get_current_InterfaceDeclaration_ISummaryContent());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryHandle": {"forwardCompat": false}
declare function get_old_InterfaceDeclaration_ISummaryHandle():
    old.ISummaryHandle;
declare function use_current_InterfaceDeclaration_ISummaryHandle(
    use: current.ISummaryHandle);
use_current_InterfaceDeclaration_ISummaryHandle(
    get_old_InterfaceDeclaration_ISummaryHandle());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryHandle": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ISummaryHandle():
    current.ISummaryHandle;
declare function use_old_InterfaceDeclaration_ISummaryHandle(
    use: old.ISummaryHandle);
use_old_InterfaceDeclaration_ISummaryHandle(
    get_current_InterfaceDeclaration_ISummaryHandle());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryNack": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryNack():
    old.ISummaryNack;
declare function use_current_InterfaceDeclaration_ISummaryNack(
    use: current.ISummaryNack);
use_current_InterfaceDeclaration_ISummaryNack(
    get_old_InterfaceDeclaration_ISummaryNack());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryNack": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryNack():
    current.ISummaryNack;
declare function use_old_InterfaceDeclaration_ISummaryNack(
    use: old.ISummaryNack);
use_old_InterfaceDeclaration_ISummaryNack(
    get_current_InterfaceDeclaration_ISummaryNack());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryProposal": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryProposal():
    old.ISummaryProposal;
declare function use_current_InterfaceDeclaration_ISummaryProposal(
    use: current.ISummaryProposal);
use_current_InterfaceDeclaration_ISummaryProposal(
    get_old_InterfaceDeclaration_ISummaryProposal());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryProposal": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryProposal():
    current.ISummaryProposal;
declare function use_old_InterfaceDeclaration_ISummaryProposal(
    use: old.ISummaryProposal);
use_old_InterfaceDeclaration_ISummaryProposal(
    get_current_InterfaceDeclaration_ISummaryProposal());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryTokenClaims": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ISummaryTokenClaims():
    old.ISummaryTokenClaims;
declare function use_current_InterfaceDeclaration_ISummaryTokenClaims(
    use: current.ISummaryTokenClaims);
use_current_InterfaceDeclaration_ISummaryTokenClaims(
    get_old_InterfaceDeclaration_ISummaryTokenClaims());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryTokenClaims": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ISummaryTokenClaims():
    current.ISummaryTokenClaims;
declare function use_old_InterfaceDeclaration_ISummaryTokenClaims(
    use: old.ISummaryTokenClaims);
use_old_InterfaceDeclaration_ISummaryTokenClaims(
    get_current_InterfaceDeclaration_ISummaryTokenClaims());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryTree": {"forwardCompat": false}
declare function get_old_InterfaceDeclaration_ISummaryTree():
    old.ISummaryTree;
declare function use_current_InterfaceDeclaration_ISummaryTree(
    use: current.ISummaryTree);
use_current_InterfaceDeclaration_ISummaryTree(
    get_old_InterfaceDeclaration_ISummaryTree());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ISummaryTree": {"backCompat": false}
declare function get_current_InterfaceDeclaration_ISummaryTree():
    current.ISummaryTree;
declare function use_old_InterfaceDeclaration_ISummaryTree(
    use: old.ISummaryTree);
use_old_InterfaceDeclaration_ISummaryTree(
    get_current_InterfaceDeclaration_ISummaryTree());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITokenClaims": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITokenClaims():
    old.ITokenClaims;
declare function use_current_InterfaceDeclaration_ITokenClaims(
    use: current.ITokenClaims);
use_current_InterfaceDeclaration_ITokenClaims(
    get_old_InterfaceDeclaration_ITokenClaims());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITokenClaims": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITokenClaims():
    current.ITokenClaims;
declare function use_old_InterfaceDeclaration_ITokenClaims(
    use: old.ITokenClaims);
use_old_InterfaceDeclaration_ITokenClaims(
    get_current_InterfaceDeclaration_ITokenClaims());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITokenProvider": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITokenProvider():
    old.ITokenProvider;
declare function use_current_InterfaceDeclaration_ITokenProvider(
    use: current.ITokenProvider);
use_current_InterfaceDeclaration_ITokenProvider(
    get_old_InterfaceDeclaration_ITokenProvider());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITokenProvider": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITokenProvider():
    current.ITokenProvider;
declare function use_old_InterfaceDeclaration_ITokenProvider(
    use: old.ITokenProvider);
use_old_InterfaceDeclaration_ITokenProvider(
    get_current_InterfaceDeclaration_ITokenProvider());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITokenService": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITokenService():
    old.ITokenService;
declare function use_current_InterfaceDeclaration_ITokenService(
    use: current.ITokenService);
use_current_InterfaceDeclaration_ITokenService(
    get_old_InterfaceDeclaration_ITokenService());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITokenService": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITokenService():
    current.ITokenService;
declare function use_old_InterfaceDeclaration_ITokenService(
    use: old.ITokenService);
use_old_InterfaceDeclaration_ITokenService(
    get_current_InterfaceDeclaration_ITokenService());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITrace": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITrace():
    old.ITrace;
declare function use_current_InterfaceDeclaration_ITrace(
    use: current.ITrace);
use_current_InterfaceDeclaration_ITrace(
    get_old_InterfaceDeclaration_ITrace());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITrace": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITrace():
    current.ITrace;
declare function use_old_InterfaceDeclaration_ITrace(
    use: old.ITrace);
use_old_InterfaceDeclaration_ITrace(
    get_current_InterfaceDeclaration_ITrace());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITree": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_ITree():
    old.ITree;
declare function use_current_InterfaceDeclaration_ITree(
    use: current.ITree);
use_current_InterfaceDeclaration_ITree(
    get_old_InterfaceDeclaration_ITree());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_ITree": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_ITree():
    current.ITree;
declare function use_old_InterfaceDeclaration_ITree(
    use: old.ITree);
use_old_InterfaceDeclaration_ITree(
    get_current_InterfaceDeclaration_ITree());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ITreeEntry": {"forwardCompat": false}
*/
declare function get_old_TypeAliasDeclaration_ITreeEntry():
    old.ITreeEntry;
declare function use_current_TypeAliasDeclaration_ITreeEntry(
    use: current.ITreeEntry);
use_current_TypeAliasDeclaration_ITreeEntry(
    get_old_TypeAliasDeclaration_ITreeEntry());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_ITreeEntry": {"backCompat": false}
*/
declare function get_current_TypeAliasDeclaration_ITreeEntry():
    current.ITreeEntry;
declare function use_old_TypeAliasDeclaration_ITreeEntry(
    use: old.ITreeEntry);
use_old_TypeAliasDeclaration_ITreeEntry(
    get_current_TypeAliasDeclaration_ITreeEntry());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IUploadedSummaryDetails": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IUploadedSummaryDetails():
    old.IUploadedSummaryDetails;
declare function use_current_InterfaceDeclaration_IUploadedSummaryDetails(
    use: current.IUploadedSummaryDetails);
use_current_InterfaceDeclaration_IUploadedSummaryDetails(
    get_old_InterfaceDeclaration_IUploadedSummaryDetails());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IUploadedSummaryDetails": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IUploadedSummaryDetails():
    current.IUploadedSummaryDetails;
declare function use_old_InterfaceDeclaration_IUploadedSummaryDetails(
    use: old.IUploadedSummaryDetails);
use_old_InterfaceDeclaration_IUploadedSummaryDetails(
    get_current_InterfaceDeclaration_IUploadedSummaryDetails());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IUser": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IUser():
    old.IUser;
declare function use_current_InterfaceDeclaration_IUser(
    use: current.IUser);
use_current_InterfaceDeclaration_IUser(
    get_old_InterfaceDeclaration_IUser());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IUser": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IUser():
    current.IUser;
declare function use_old_InterfaceDeclaration_IUser(
    use: old.IUser);
use_old_InterfaceDeclaration_IUser(
    get_current_InterfaceDeclaration_IUser());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IVersion": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IVersion():
    old.IVersion;
declare function use_current_InterfaceDeclaration_IVersion(
    use: current.IVersion);
use_current_InterfaceDeclaration_IVersion(
    get_old_InterfaceDeclaration_IVersion());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IVersion": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IVersion():
    current.IVersion;
declare function use_old_InterfaceDeclaration_IVersion(
    use: old.IVersion);
use_old_InterfaceDeclaration_IVersion(
    get_current_InterfaceDeclaration_IVersion());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_MessageType": {"forwardCompat": false}
*/
declare function get_old_EnumDeclaration_MessageType():
    old.MessageType;
declare function use_current_EnumDeclaration_MessageType(
    use: current.MessageType);
use_current_EnumDeclaration_MessageType(
    get_old_EnumDeclaration_MessageType());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_MessageType": {"backCompat": false}
*/
declare function get_current_EnumDeclaration_MessageType():
    current.MessageType;
declare function use_old_EnumDeclaration_MessageType(
    use: old.MessageType);
use_old_EnumDeclaration_MessageType(
    get_current_EnumDeclaration_MessageType());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_NackErrorType": {"forwardCompat": false}
*/
declare function get_old_EnumDeclaration_NackErrorType():
    old.NackErrorType;
declare function use_current_EnumDeclaration_NackErrorType(
    use: current.NackErrorType);
use_current_EnumDeclaration_NackErrorType(
    get_old_EnumDeclaration_NackErrorType());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_NackErrorType": {"backCompat": false}
*/
declare function get_current_EnumDeclaration_NackErrorType():
    current.NackErrorType;
declare function use_old_EnumDeclaration_NackErrorType(
    use: old.NackErrorType);
use_old_EnumDeclaration_NackErrorType(
    get_current_EnumDeclaration_NackErrorType());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_ScopeType": {"forwardCompat": false}
*/
declare function get_old_EnumDeclaration_ScopeType():
    old.ScopeType;
declare function use_current_EnumDeclaration_ScopeType(
    use: current.ScopeType);
use_current_EnumDeclaration_ScopeType(
    get_old_EnumDeclaration_ScopeType());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_ScopeType": {"backCompat": false}
*/
declare function get_current_EnumDeclaration_ScopeType():
    current.ScopeType;
declare function use_old_EnumDeclaration_ScopeType(
    use: old.ScopeType);
use_old_EnumDeclaration_ScopeType(
    get_current_EnumDeclaration_ScopeType());

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_SummaryObject": {"forwardCompat": false}
declare function get_old_TypeAliasDeclaration_SummaryObject():
    old.SummaryObject;
declare function use_current_TypeAliasDeclaration_SummaryObject(
    use: current.SummaryObject);
use_current_TypeAliasDeclaration_SummaryObject(
    get_old_TypeAliasDeclaration_SummaryObject());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_SummaryObject": {"backCompat": false}
declare function get_current_TypeAliasDeclaration_SummaryObject():
    current.SummaryObject;
declare function use_old_TypeAliasDeclaration_SummaryObject(
    use: old.SummaryObject);
use_old_TypeAliasDeclaration_SummaryObject(
    get_current_TypeAliasDeclaration_SummaryObject());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_SummaryTree": {"forwardCompat": false}
declare function get_old_TypeAliasDeclaration_SummaryTree():
    old.SummaryTree;
declare function use_current_TypeAliasDeclaration_SummaryTree(
    use: current.SummaryTree);
use_current_TypeAliasDeclaration_SummaryTree(
    get_old_TypeAliasDeclaration_SummaryTree());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_SummaryTree": {"backCompat": false}
declare function get_current_TypeAliasDeclaration_SummaryTree():
    current.SummaryTree;
declare function use_old_TypeAliasDeclaration_SummaryTree(
    use: old.SummaryTree);
use_old_TypeAliasDeclaration_SummaryTree(
    get_current_TypeAliasDeclaration_SummaryTree());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_SummaryType": {"forwardCompat": false}
declare function get_old_EnumDeclaration_SummaryType():
    old.SummaryType;
declare function use_current_EnumDeclaration_SummaryType(
    use: current.SummaryType);
use_current_EnumDeclaration_SummaryType(
    get_old_EnumDeclaration_SummaryType());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_SummaryType": {"backCompat": false}
declare function get_current_EnumDeclaration_SummaryType():
    current.SummaryType;
declare function use_old_EnumDeclaration_SummaryType(
    use: old.SummaryType);
use_old_EnumDeclaration_SummaryType(
    get_current_EnumDeclaration_SummaryType());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_SummaryTypeNoHandle": {"forwardCompat": false}
declare function get_old_TypeAliasDeclaration_SummaryTypeNoHandle():
    old.SummaryTypeNoHandle;
declare function use_current_TypeAliasDeclaration_SummaryTypeNoHandle(
    use: current.SummaryTypeNoHandle);
use_current_TypeAliasDeclaration_SummaryTypeNoHandle(
    get_old_TypeAliasDeclaration_SummaryTypeNoHandle());
*/

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "TypeAliasDeclaration_SummaryTypeNoHandle": {"backCompat": false}
declare function get_current_TypeAliasDeclaration_SummaryTypeNoHandle():
    current.SummaryTypeNoHandle;
declare function use_old_TypeAliasDeclaration_SummaryTypeNoHandle(
    use: old.SummaryTypeNoHandle);
use_old_TypeAliasDeclaration_SummaryTypeNoHandle(
    get_current_TypeAliasDeclaration_SummaryTypeNoHandle());
*/

/*
* validate forward compat by using old type in place of current type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_TreeEntry": {"forwardCompat": false}
*/
declare function get_old_EnumDeclaration_TreeEntry():
    old.TreeEntry;
declare function use_current_EnumDeclaration_TreeEntry(
    use: current.TreeEntry);
use_current_EnumDeclaration_TreeEntry(
    get_old_EnumDeclaration_TreeEntry());

/*
* validate back compat by using current type in place of old type
* to disable, add in package.json under typeValidation.broken:
* "EnumDeclaration_TreeEntry": {"backCompat": false}
*/
declare function get_current_EnumDeclaration_TreeEntry():
    current.TreeEntry;
declare function use_old_EnumDeclaration_TreeEntry(
    use: old.TreeEntry);
use_old_EnumDeclaration_TreeEntry(
    get_current_EnumDeclaration_TreeEntry());
