#pragma once
#include <cstdint>
#include <limits>

// A Seq is a sequence number. Alternately, you can think of it as a version number.
// There are three main categories:
// * Seq::Universal() is used for segments that have been seen by all clients
// * "acked" seqs are for segments that the server has seen, but which other clients might use as a base
// * local seqs are for segments that the server has not yet acknowledged
// So, for local changes the lifecycle is:
// local seq -> sent to server -> acked seq -> sent to all clients -> universal seq
// And, for remote changes:
// acked seq -> sent to all clients -> universal seq
struct Seq
{
private:
	uint32_t seq;

	Seq() = delete;
	explicit constexpr Seq(uint32_t seq) : seq(seq) {}
	explicit constexpr operator uint32_t() const { return seq; }

public:
	static constexpr Seq Universal() { return Seq{ 0 }; }
	static constexpr Seq Invalid() { return Seq{ std::numeric_limits<uint32_t>::max() }; }
	static constexpr Seq LocalFirst() { return Seq{ static_cast<uint32_t>(std::numeric_limits<int32_t>::max()) + 1 }; }
	static constexpr Seq Max() { return Seq{ std::numeric_limits<uint32_t>::max() - 1 }; }
	static constexpr Seq Create(uint32_t seq) { return Seq{ seq }; }

	constexpr bool isAcked() const { return *this < LocalFirst(); }
	constexpr Seq next() const { return Seq{ seq + 1 }; }

	constexpr bool operator<(const Seq &other) const { return seq < other.seq; }
	constexpr bool operator>(const Seq &other) const { return seq > other.seq; }
	constexpr bool operator<=(const Seq &other) const { return seq <= other.seq; }
	constexpr bool operator>=(const Seq &other) const { return seq >= other.seq; }
	constexpr bool operator==(const Seq &other) const { return seq == other.seq; }
	constexpr bool operator!=(const Seq &other) const { return seq != other.seq; }
};

// A CharacterPosition is the index of a single character in the tree.
// It only has meaning relative to a Seq, and any API that operates on CharacterPositions
// will also take a Seq as a parameter in some way.
struct CharacterPosition
{
private:
	int cp = -1;

public:
	CharacterPosition() noexcept = default;

	explicit constexpr CharacterPosition(int cp) : cp(cp) {}
	int AsInt() const { return cp; }

	static constexpr CharacterPosition Invalid() { return CharacterPosition(-1); }
	static constexpr CharacterPosition Create(int cp) { return CharacterPosition{ cp }; }

	constexpr bool operator<(const CharacterPosition &other) const { return cp < other.cp; }
	constexpr bool operator>(const CharacterPosition &other) const { return cp > other.cp; }
	constexpr bool operator<=(const CharacterPosition &other) const { return cp <= other.cp; }
	constexpr bool operator>=(const CharacterPosition &other) const { return cp >= other.cp; }
	constexpr bool operator==(const CharacterPosition &other) const { return cp == other.cp; }
	constexpr bool operator!=(const CharacterPosition &other) const { return cp != other.cp; }

	CharacterPosition operator+(int dcp) const { return CharacterPosition(cp + dcp); }
	CharacterPosition operator-(int dcp) const { return CharacterPosition(cp - dcp); }
};

struct ClientId
{
private:
	uint32_t client;

	ClientId() = delete;
	explicit constexpr ClientId(uint32_t client) : client(client) {}

public:
	static constexpr ClientId Nil() { return ClientId{ std::numeric_limits<uint32_t>::max() }; }
	static constexpr ClientId Local() { return ClientId{ 0 }; }
	static constexpr ClientId Create(uint32_t client) { return ClientId{ client }; }

	constexpr bool operator<(const ClientId &other) const { return client < other.client; }
	constexpr bool operator>(const ClientId &other) const { return client > other.client; }
	constexpr bool operator<=(const ClientId &other) const { return client <= other.client; }
	constexpr bool operator>=(const ClientId &other) const { return client >= other.client; }
	constexpr bool operator==(const ClientId &other) const { return client == other.client; }
	constexpr bool operator!=(const ClientId &other) const { return client != other.client; }
};

