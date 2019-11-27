#pragma once
#include <algorithm>
#include <array>
#include <cassert>
#include <vector>
#include "Seq.h"

template <size_t TBlockSize>
struct TPartialLengths
{
	static constexpr size_t BlockSize = TBlockSize;

	using Index = int;
	using Length = uint32_t;
	static constexpr Length lengthNil = std::numeric_limits<Length>::max();
	static constexpr Length lengthMax = lengthNil - 1;

private:
	Index count = 0;
	std::array<Length, BlockSize> lengths;

public:
	TPartialLengths()
	{
		std::fill(lengths.begin(), lengths.end(), lengthNil);
	}
	
	template <typename TIter>
	TPartialLengths(TIter itB, TIter itE)
		: count(static_cast<Index>(itE - itB))
	{
		std::copy(itB, itE, lengths.begin());
		std::fill(lengths.begin() + count, lengths.end(), lengthNil);
	}

	Index Count() const
	{
		return count;
	}

	struct FindResult
	{
		Index index; // index of the matching entry in the block
		Length offset; // offset of the found cp in the matching entry

		bool operator==(const FindResult &other) const
		{
			return index == other.index && offset == other.offset;
		}
	};

	FindResult Find(Length offset) const
	{
		assert(offset >= 0);
		assert(offset <= lengths.back());

		auto it = std::upper_bound(lengths.begin(), lengths.end(), offset);

		if (it == lengths.begin())
			return { 0, offset };

		return { static_cast<Index>(it - lengths.begin()), offset - *(it - 1) };
	}

	Length LengthAt(Index i) const
	{
		return lengths[i];
	}

	void SetLengthAt(Index i, Length l)
	{
		lengths[i] = l;
	}

	Length TotalLength() const
	{
		assert(count == BlockSize || lengths[count] == lengthNil);
		return lengths[count - 1];
	}

	void InsertColumn(Index index)
	{
		std::copy_backward(lengths.begin() + index, lengths.end() - 1, lengths.end());
		lengths[index] = (index == 0) ? 0 : lengths[index - 1];
		count++;
	}

	void Update(Index index, Length length)
	{
		for (size_t i = index; i < lengths.size(); i++)
		{
			if (lengths[i] == lengthNil)
				break;
			lengths[i] += length;
		}
	}

	void SplitColumn(Index index, Length length)
	{
		InsertColumn(index + 1);
		lengths[index] -= length;
	}

	// Move our latter half to other
	void Split(TPartialLengths &other)
	{
		std::copy(lengths.begin() + BlockSize / 2, lengths.end(), other.lengths.begin());
		int adjustment = lengths[BlockSize / 2 - 1];
		for (int i = 0; i < BlockSize / 2; i++)
			other.lengths[i] -= adjustment;
		std::fill(lengths.begin() + BlockSize / 2, lengths.end(), lengthNil);
		std::fill(other.lengths.begin() + BlockSize / 2, other.lengths.end(), lengthNil);
	}

	void CheckInvariants() const
	{
		assert(std::is_sorted(lengths.begin(), lengths.end()));

		auto isNil = [](Length len) -> bool { return len == lengthNil; };
		assert(std::none_of(lengths.begin(), lengths.begin() + count, isNil));
		assert(std::all_of(lengths.begin() + count, lengths.end(), isNil));
	}

	bool operator==(const TPartialLengths &other) const noexcept
	{
		return std::equal(lengths.begin(), lengths.end(), other.lengths.begin(), other.lengths.end());
	}
};
