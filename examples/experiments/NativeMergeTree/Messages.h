#pragma once
#include <cstdint>
#include <string>
#include <variant>
#include <vector>
#include "Seq.h"

// Things in this file approximately line up with
// routerlicious/src/api-core/protocol.ts
// and
// routerlicious/src/merge-tree/ops.ts

// analogous to ITenantUser
struct TenantUser
{
	std::string id;
	std::string name;
};

// analogous to IMergeTreeInsertMsg
struct MergeTreeInsertMsg
{
	CharacterPosition pos1 = CharacterPosition::Invalid();
	CharacterPosition pos2 = CharacterPosition::Invalid();
	std::string text;
};

// analogous to IMergeTreeRemoveMsg
struct MergeTreeRemoveMsg
{
	CharacterPosition pos1 = CharacterPosition::Invalid();
	CharacterPosition pos2 = CharacterPosition::Invalid();
};

// analogous to IMergeTreeGroupMsg
struct MergeTreeGroupMsg
{
	std::vector<struct Message> ops;
};

// analogous to IObjectMessage
struct Message
{
	Seq clientSequenceNumber = Seq::Invalid();
	Seq referenceSequenceNumber = Seq::Invalid();

	std::variant<
		MergeTreeInsertMsg,
		MergeTreeRemoveMsg,
		MergeTreeGroupMsg
	> contents;

	MergeTreeInsertMsg *GetAsInsert() { return std::get_if<MergeTreeInsertMsg>(&contents); }
	MergeTreeRemoveMsg *GetAsRemove() { return std::get_if<MergeTreeRemoveMsg>(&contents); }
	MergeTreeGroupMsg *GetAsGroup() { return std::get_if<MergeTreeGroupMsg>(&contents); }
};

// analogous to ISequencedObjectMessage
struct SequencedMessage : public Message
{
	Seq sequenceNumber = Seq::Invalid();
	Seq minimumSequenceNumber = Seq::Invalid();

	TenantUser user;
	ClientId clientId = ClientId::Nil();
};

