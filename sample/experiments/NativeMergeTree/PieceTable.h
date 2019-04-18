#pragma once
#include <vector>
#include <memory>
#include <string_view>
#include <algorithm>
#include "MergeTree.h" // for Segment

struct PieceTable
{
public:
	using CP = int;
	using Index = int;

private:
	using RGCP = std::vector<CP>;
	using RGSEG = std::vector<std::shared_ptr<Segment>>;

	// m_rgcp holds the CP of each segment, plus cpMac
	// so if you have three segments of length 3, it would look like:
	// 0, 3, 6, 9

	RGCP m_rgcp;
	RGSEG m_rgseg;

	// Returns the CP of the i'th segment
	CP CpFromI(Index i) const
	{
		assert(i < static_cast<int>(m_rgcp.size()));
		return m_rgcp[i];
	}

	// Returns the index of the segment containing cp
	Index IFindCp(CP cp) const
	{
		RGCP::const_iterator it;
		it = std::lower_bound(m_rgcp.begin(), m_rgcp.end(), cp);
		if (it == m_rgcp.end() || *it != cp)
			it--; // lower_bound returns the next element if there's no match, but we want the previous
		return static_cast<Index>(it - m_rgcp.begin());
	}

	// Ensures that cp is at a segment boundary, splitting the segment if necessary.
	Index ISplitCp(CP cp)
	{
		Index i = IFindCp(cp);
		CP cpBase = CpFromI(i); // cp of beginning of segment
		if (cpBase == cp)
			return i; // cp is already on a segment boundary

		assert(cpBase < cp);
		std::shared_ptr<Segment> segNew = m_rgseg[i]->splitAt(cp - cpBase);
		m_rgseg.insert(m_rgseg.begin() + i + 1, std::move(segNew));
		m_rgcp.insert(m_rgcp.begin() + i + 1, cp);
		CheckInvariants();
		return i + 1;
	}

	void AdjustCps(Index i, CP dcp)
	{
		for (; i < static_cast<int>(m_rgcp.size()); i++)
			m_rgcp[i] += dcp;
	}

	void CheckInvariants() const
	{
#ifdef _DEBUG
		assert(m_rgcp[0] == 0);
		assert(m_rgseg.size() == m_rgcp.size() - 1);

		assert(std::is_sorted(m_rgcp.begin(), m_rgcp.end()));
		for (Index i = 0; i < static_cast<int>(m_rgseg.size()); i++)
			assert(m_rgcp[i + 1] - m_rgcp[i] == m_rgseg[i]->length);
#endif
	}

public:
	PieceTable()
	{
		m_rgcp.push_back(0);
	}

	// Returns the number of segments
	Index IMac() const
	{
		return static_cast<Index>(m_rgseg.size());
	}

	// Returns the number of CPs in the document
	CP CpMac() const
	{
		return m_rgcp.back();
	}

	// Returns a run of text starting at cp
	std::string_view Fetch(CP cp) const
	{
		if (cp >= CpMac())
		{
			assert(cp == CpMac());
			return std::string_view();
		}
		Index i = IFindCp(cp);
		std::string_view text = m_rgseg[i]->Text();
		text.remove_prefix(cp - CpFromI(i));

		assert(text.size() > 0);
		return text;
	}

	// Replaces 'dcp' characters, starting at 'cp', with 'text'
	void Replace(CP cp, CP dcp, std::string_view text)
	{
		std::unique_ptr<TextSegment> seg;
		if (text.size() > 0)
			seg = std::make_unique<TextSegment>(text);
		Index i1 = ISplitCp(cp);
		Index i2 = (dcp == 0) ? i1 : ISplitCp(cp + dcp);

		if (i1 < i2 && seg != nullptr)
		{
			// erase all but one, and replace the one with cp/seg
			m_rgcp.erase(m_rgcp.begin() + i1 + 1, m_rgcp.begin() + i2);
			m_rgseg.erase(m_rgseg.begin() + i1 + 1, m_rgseg.begin() + i2);
			assert(m_rgcp[i1] == cp);
			m_rgseg[i1] = std::move(seg);
			AdjustCps(i1 + 1, m_rgseg[i1]->length - dcp);
		}
		else if (i1 < i2)
		{
			// just erase existing range
			m_rgcp.erase(m_rgcp.begin() + i1, m_rgcp.begin() + i2);
			m_rgseg.erase(m_rgseg.begin() + i1, m_rgseg.begin() + i2);
			AdjustCps(i1, -dcp);
		}
		else if (seg != nullptr)
		{
			// just insert new cp/seg
			m_rgcp.insert(m_rgcp.begin() + i1, cp);
			m_rgseg.insert(m_rgseg.begin() + i1, std::move(seg));
			AdjustCps(i1 + 1, m_rgseg[i1]->length);
		}
		else
		{
			// ... nothing to do, I guess?
		}

		CheckInvariants();
	}

	void ReloadFromSegments(std::vector<std::shared_ptr<Segment>> segments)
	{
		m_rgcp.clear();
		m_rgseg = std::move(segments);
		m_rgcp.reserve(m_rgseg.size() + 1);
		m_rgcp.push_back(0);

		CP cpMac = 0;
		for (const auto &seg : m_rgseg)
		{
			cpMac += seg->length;
			m_rgcp.push_back(cpMac);
		}

		CheckInvariants();
	}

	friend class PieceTableTest;
};