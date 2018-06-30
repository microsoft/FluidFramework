#pragma once
#include <algorithm>
#include <array>
#include <cassert>
#include <vector>
#include "Seq.h"

template <size_t BlockSize>
struct TLengthMap
{
	static constexpr size_t cBlockSize = BlockSize;

	struct FindResult
	{
		int relOffset;
		int index;

		bool operator==(const FindResult &other) const
		{
			return relOffset == other.relOffset &&
				index == other.index;
		}
	};

	struct Entry
	{
		Seq seq;
		std::array<int, BlockSize> lengths;

		static constexpr int lengthNil = std::numeric_limits<int>::max();

		Entry(Seq seq)
			: seq(seq)
		{
			std::fill(lengths.begin(), lengths.end(), lengthNil);
		}

		Entry(Seq seq, std::initializer_list<int> il)
			: Entry(seq)
		{
			assert(il.size() < lengths.size());
			std::copy(il.begin(), il.end(), lengths.begin());
			CheckInvariants(il.size());
		}

		Seq GetSeq() const { return seq; }
		void SetSeq(Seq seq) { this->seq = seq; }

		FindResult Find(int offset) const
		{
			assert(offset >= 0);
			assert(offset <= lengths.back());

			auto it = std::upper_bound(lengths.begin(), lengths.end(), offset);

			if (it == lengths.begin())
				return { offset, 0 };

			return { offset - *(it - 1), static_cast<int>(it - lengths.begin()) };
		}

		int LengthAt(int i) const
		{
			return lengths[i];
		}

		void InsertColumn(int index)
		{
			std::copy_backward(lengths.begin() + index, lengths.end() - 1, lengths.end());
			lengths[index] = (index == 0) ? 0 : lengths[index - 1];
		}

		void Update(int index, int length)
		{
			for (size_t i = index; i < lengths.size(); i++)
			{
				if (lengths[i] == lengthNil)
					break;
				lengths[i] += length;
			}
		}

		// Move our latter half to other
		void Split(Entry &other)
		{
			assert(seq == other.seq);
			std::copy(lengths.begin() + BlockSize / 2, lengths.end(), other.lengths.begin());
			int adjustment = lengths[BlockSize / 2 - 1];
			for (int i = 0; i < BlockSize / 2; i++)
				other.lengths[i] -= adjustment;
			std::fill(lengths.begin() + BlockSize / 2, lengths.end(), lengthNil);
			std::fill(other.lengths.begin() + BlockSize / 2, other.lengths.end(), lengthNil);
		}

		void CheckInvariants(int childCount) const
		{
			assert(std::is_sorted(lengths.begin(), lengths.end()));

			auto isNil = [](int len) -> bool { return len == lengthNil; };
			assert(std::none_of(lengths.begin(), lengths.begin() + childCount, isNil));
			assert(std::all_of(lengths.begin() + childCount, lengths.end(), isNil));
		}

		bool operator<(const Entry &other) const noexcept
		{
			return seq < other.seq;
		}

		bool operator==(const Entry &other) const noexcept
		{
			return seq == other.seq && std::equal(lengths.begin(), lengths.end(), other.lengths.begin(), other.lengths.end());
		}
	};

	struct EntrySeqCompare
	{
		bool operator()(const Entry &entry, const Seq &seq) const noexcept
		{
			return entry.GetSeq() < seq;
		}

		bool operator()(const Seq &seq, const Entry &entry) const noexcept
		{
			return seq < entry.GetSeq();
		}
	};

private:
	std::vector<Entry> map;
	int childCount;

public:
	TLengthMap()
		: childCount(0)
	{
		map.emplace_back(Seq::Universal());
	}

	TLengthMap(std::vector<Entry> entries, int childCount)
		: map(std::move(entries))
		, childCount(childCount)
	{
		CheckInvariants();
	}
	
	TLengthMap(std::initializer_list<Entry> il, int childCount)
		: map(il)
		, childCount(childCount)
	{
		CheckInvariants();
	}

	int ChildCount() const { return childCount; }
	const std::vector<Entry> &Entries() const { return map; }

	FindResult Find(Seq seq, int offset) const
	{
		assert(map.front().GetSeq() == Seq::Universal());
		if (seq == Seq::Universal())
			return map.front().Find(offset);
		auto it = std::lower_bound(map.begin(), map.end(), seq, EntrySeqCompare{});
		if (it == map.end() || it->GetSeq() != seq)
			it--;
		return it->Find(offset);
	}

	uint32_t GetLength(Seq seq) const
	{
		assert(childCount > 0);
		// Shortcut for common case
		if (seq >= map.back().GetSeq())
			return map.back().LengthAt(childCount - 1);

		// Special handling for the first entry
		assert(map.front().GetSeq() == Seq::Universal());
		if (seq == Seq::Universal())
			return map.front().LengthAt(childCount - 1);

		// Return the length of the largest seq <= 'seq'
		auto it = std::upper_bound(map.begin(), map.end(), seq, EntrySeqCompare{});
		it--;
		return it->LengthAt(childCount - 1);
	}

	void EnsureEntry(Seq seq)
	{
		auto it = std::lower_bound(map.begin(), map.end(), seq, EntrySeqCompare{});
		if (it != map.end() && it->GetSeq() == seq)
			return;

		Entry entry = *(it - 1);
		entry.SetSeq(seq);
		map.insert(it, entry);
	}

	Seq SeqFirstLocal() const
	{
		auto it = std::lower_bound(map.begin(), map.end(), Seq::LocalFirst(), EntrySeqCompare{});
		if (it == map.end())
			return Seq::Invalid();
		return it->GetSeq();
	}

	void Insert(Seq seqAdded, Seq seqRemoved, int index, int length)
	{
		assert(index >= 0);
		assert(index <= ChildCount());
		EnsureEntry(seqAdded);
		if (seqRemoved != Seq::Invalid())
			EnsureEntry(seqRemoved);

		for (Entry &entry : map)
		{
			entry.InsertColumn(index);
			if (entry.GetSeq() >= seqAdded && entry < seqRemoved)
				entry.Update(index, length);
		}

		childCount++;
	}

	void Update(Seq seqStart, Seq seqEnd, int index, int length)
	{
		EnsureEntry(seqStart);
		if (seqEnd != Seq::Invalid())
			EnsureEntry(seqEnd);

		for (Entry &entry : map)
		{
			if (entry.GetSeq() >= seqStart && entry < seqEnd)
				entry.Update(index, length);
		}
	}

	void SplitColumn(int index, int dcp, Seq seqBegin, Seq seqEnd)
	{
		assert(index < BlockSize - 1);
		for (Entry &entry : map)
		{
			entry.InsertColumn(index + 1);
			if (entry.seq >= seqBegin && entry.seq < seqEnd)
				entry.lengths[index] -= dcp;
		}
		childCount++;
	}

	TLengthMap<BlockSize> Split()
	{
		static_assert(BlockSize % 2 == 0);
		constexpr int iLastLeft = BlockSize / 2 - 1;

		std::vector<Entry> newMap;
		newMap.reserve(map.size());
		for (Entry &entry : map)
		{
			newMap.emplace_back(entry.GetSeq());
			entry.Split(newMap.back());
		}

		auto removeDups = [](std::vector<Entry> &map) -> void
		{
			for (size_t i = 1; i < map.size(); i++)
			{
				Entry &curr = map[i];
				const Entry &prev = map[i - 1];
				if (std::equal(curr.lengths.begin(), curr.lengths.end(), prev.lengths.begin()))
					curr.SetSeq(Seq::Invalid());
			}
			map.erase(std::remove_if(map.begin(), map.end(), [](const Entry &entry) {return entry.GetSeq() == Seq::Invalid(); }), map.end());
		};

		removeDups(newMap);
		removeDups(map);
		int newMapChildCount = ChildCount() - (BlockSize / 2);
		childCount = BlockSize / 2;
		return TLengthMap<BlockSize>(std::move(newMap), newMapChildCount);
	}

	void Commit(Seq seqLocal, Seq seqServer)
	{
		auto it = std::lower_bound(map.begin(), map.end(), seqServer, EntrySeqCompare{});
		assert(it->GetSeq() == seqLocal);
		assert((it - 1)->GetSeq() < seqServer);

		it->SetSeq(seqServer);
	}

	void CheckInvariants()
	{
		assert(map.front().GetSeq() == Seq::Universal());
		assert(std::is_sorted(map.begin(), map.end()));
		for (const Entry &entry : map)
		{
			entry.CheckInvariants(childCount);
		}
	}

	bool operator==(const TLengthMap<BlockSize> &other) const
	{
		if (ChildCount() != other.ChildCount())
			return false;

		auto it1 = map.begin();
		auto it2 = other.map.begin();
		assert(it1->seq == Seq::Universal());
		assert(it2->seq == Seq::Universal());

		while (it1 != map.end() && it2 != other.map.end())
		{
			if (it1->seq == it2->seq)
			{
				if (it1->lengths != it2->lengths)
					return false;
				it1++;
				it2++;
				continue;
			}

			if (it1->seq < it2->seq)
			{
				if (it1->lengths != (it2 - 1)->lengths)
					return false;
				it1++;
				continue;
			}

			if (it1->seq > it2->seq)
			{
				if ((it1 - 1)->lengths != it2->lengths)
					return false;
				it2++;
				continue;
			}
		}
		
		while (it1 != map.end())
		{
			if (it1->lengths != (it2 - 1)->lengths)
				return false;
			it1++;
		}

		while (it2 != other.map.end())
		{
			if ((it1 - 1)->lengths != it2->lengths)
				return false;
			it2++;
		}

		return true;
	}
};

