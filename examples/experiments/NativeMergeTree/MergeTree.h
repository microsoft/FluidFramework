#pragma once
#include <memory>
#include <string>
#include <list>
#include <optional>
#include <functional>
#include "array_view.h"
#include "Seq.h"
#include "PartialLengths.h"
#include "Messages.h"
#include "Router.h"
#include "FileTable.h"

namespace Config
{

constexpr size_t BlockSize()
{
	return 32;
}

}

// Helper for comparisons
template <typename TStruct, auto pfn>
struct order_by
{
	using Struct = TStruct;
	using Member = std::invoke_result_t<decltype(pfn), TStruct>;

	bool operator()(const Struct &s1, const Struct &s2) const
	{
		return pfn(s1) < pfn(s2);
	}

	bool operator()(const Struct &s1, const Member &m2) const
	{
		return pfn(s1) < m2;
	}

	bool operator()(const Member &m1, const Struct &s2) const
	{
		return m1 < pfn(s2);
	}
};

enum class SegmentType {
	Base,
	Text,
	//	Marker,
	//	External,
};

struct Segment;
struct MergeNode;
struct MergeBlock;
struct MergeTree;

struct MergeNode
{
	MergeBlock *parent = nullptr;
	int8_t index = -1; // childIndex in parent's array of children
	bool isLeaf = false;

	MergeNode(bool isLeaf)
		: isLeaf(isLeaf)
	{}

	virtual ~MergeNode() = default;

	void updateParentLengths(int length);

protected:
	MergeNode(const MergeNode &) = default;
	MergeNode &operator=(const MergeNode &) = default;
};

struct Adjustment
{
	CharacterPosition cp;
	int32_t dcp;

	Adjustment() : cp(CharacterPosition::Invalid()) {}
	Adjustment(CharacterPosition cp, int32_t dcp) : cp(cp), dcp(dcp) {}
};

enum class Stick
{
	Left,
	Right,
};

inline CharacterPosition CpAdjustCp(CharacterPosition cp, const Adjustment &adj, Stick stick)
{
	if (cp < adj.cp || adj.dcp == 0)
		return cp;

	if (adj.dcp < 0)
	{
		if (cp > adj.cp - adj.dcp)
			return cp + adj.dcp;

		// if we're in the deleted range, collapse to the beginning
		return adj.cp;
	}
	else // adj.dcp > 0
	{
		if (cp > adj.cp)
			return cp + adj.dcp;

		if (stick == Stick::Right)
			return cp + adj.dcp; 
		return cp;
	}
}

struct Edit
{
	Seq seq;
	ClientId client;
	std::vector<std::weak_ptr<Segment>> segmentsAdded;
	std::vector<std::weak_ptr<Segment>> segmentsRemoved;
	Adjustment adjustment;

	static constexpr order_by<Edit, &Edit::seq> OrderBySeq{};

	Edit(Seq seq, ClientId client)
		: seq(seq)
		, client(client)
	{}
};

inline Seq SeqFromEditPtr(const std::shared_ptr<Edit> &ped)
{
	return ped->seq;
}

constexpr const order_by<std::shared_ptr<Edit>, &SeqFromEditPtr> OrderEditPtrBySeq{};

struct Segment : public MergeNode
{
	SegmentType m_type;
	int length;
	bool isDead = false;
	std::weak_ptr<Edit> edAdded;
	std::weak_ptr<Edit> edRemoved;

	Segment(SegmentType type, int length)
		: MergeNode(true /*isLeaf*/)
		, m_type(type)
		, length(length)
	{}

	virtual ~Segment() = default;
	virtual std::string_view Text() = 0;
	virtual std::shared_ptr<Segment> splitAt(int pos) = 0;

	bool IsRemoved() const
	{
		std::shared_ptr<Edit> ed = edRemoved.lock();
		return ed != nullptr;
	}
};

struct TextSegment final : public Segment
{
	std::string m_text;

	TextSegment(std::string_view text)
		: Segment(SegmentType::Text, static_cast<int>(text.length()))
		, m_text(text)
	{}

	std::string_view Text() override
	{
		return m_text;
	}

	std::shared_ptr<Segment> splitAt(int pos) override
	{
		if (pos > 0)
		{
			std::string remainingText = m_text.substr(pos);
			m_text.resize(pos);
			length = static_cast<int>(m_text.size());

			std::shared_ptr<TextSegment> leafSegment = std::make_shared<TextSegment>(*this);
			leafSegment->m_text = std::move(remainingText);
			leafSegment->length = static_cast<int>(leafSegment->m_text.size());

			std::shared_ptr<Edit> ed = leafSegment->edAdded.lock();
			if (ed)
				ed->segmentsAdded.push_back(leafSegment);
			ed = leafSegment->edRemoved.lock();
			if (ed)
				ed->segmentsRemoved.push_back(leafSegment);

			return leafSegment;
		}
		return nullptr;
	}
};

struct ExternalSegment final : public Segment
{
	FN fn;
	const char *m_text;

	ExternalSegment(FN fn, const char *text, int length)
		: Segment(SegmentType::Text, length)
		, fn(fn)
		, m_text(text)
	{}

	std::string_view Text() override
	{
		return std::string_view(m_text, length);
	}

	std::shared_ptr<Segment> splitAt(int pos) override
	{
		if (pos > 0)
		{
			std::shared_ptr<ExternalSegment> leafSegment = std::make_shared<ExternalSegment>(*this);
			leafSegment->m_text = m_text + pos;
			leafSegment->length -= pos;
			length = pos;

			std::shared_ptr<Edit> ed = leafSegment->edAdded.lock();
			if (ed)
				ed->segmentsAdded.push_back(leafSegment);
			ed = leafSegment->edRemoved.lock();
			if (ed)
				ed->segmentsRemoved.push_back(leafSegment);

			return leafSegment;
		}
		return nullptr;
	}
};

struct MergeBlock final : public MergeNode
{
	static constexpr size_t MaxNodesInBlock = Config::BlockSize();
	static constexpr size_t IdealNodesInBlock = MaxNodesInBlock * 3 / 4;
	static constexpr int MaxDepthImbalance = 2;

	using ChildNodeArray = std::array<std::shared_ptr<MergeNode>, MaxNodesInBlock>;
	using PartialLengths = TPartialLengths<MaxNodesInBlock>;
	ChildNodeArray children;
	PartialLengths lengths;

	struct Stats
	{
		int8_t depthMin = 0;
		int8_t depthMax = 0;
		int8_t cDeadSegments = 0;
	};
	Stats stats;

	MergeBlock() : MergeNode(false /*isLeaf*/) {}

	MergeBlock(const MergeBlock &) = delete;
	MergeBlock &operator=(const MergeBlock &) = delete;

	MergeBlock(MergeBlock &&other)
		: MergeNode(false /*isLeaf*/)
		, children(std::move(other.children))
		, lengths(std::move(other.lengths))
		, stats(other.stats)
	{
		for (auto&& child : *this)
			child->parent = this;
	}

	MergeBlock &operator=(MergeBlock &&other)
	{
		children = std::move(other.children);
		lengths = std::move(other.lengths);
		stats = other.stats;

		for (auto&& child : *this)
			child->parent = this;
		return *this;
	}

	template <typename TIter>
	MergeBlock(TIter b, TIter e)
		: MergeNode(false /*isLeaf*/)
	{
		static_assert(std::is_same_v<
			std::decay_t<decltype(*b)>,
			std::shared_ptr<MergeNode>
		>);
		assert((e - b) <= MaxNodesInBlock);
		for (int i = 0; b != e && i < MaxNodesInBlock; i++, b++)
		{
			children[i] = *b;
			children[i]->parent = this;
			children[i]->index = i;

			if (i > 0)
				assert(children[i - 1]->isLeaf == children[i]->isLeaf);
		}

		lengths = recomputeLengthsSlow();
		stats = recomputeStatsSlow();
	}

	int ChildCount() const { return lengths.Count(); }
	bool isFull() const { return ChildCount() == MaxNodesInBlock; }
	bool IsUnbalanced() const { return (stats.depthMax - stats.depthMin) > MaxDepthImbalance; }

	MergeNode *get(int i) const
	{
		assert(i >= 0 && i < ChildCount());
		return children[i].get();
	}

	ChildNodeArray::iterator begin() { return children.begin(); }
	ChildNodeArray::iterator end() { return children.begin() + ChildCount(); }
	ChildNodeArray::const_iterator begin() const { return children.begin(); }
	ChildNodeArray::const_iterator end() const { return children.begin() + ChildCount(); }

	struct FindResult
	{
		MergeNode *node; // found node
		PartialLengths::Length offset; // offset within the node of the found cp
	};

	FindResult find(uint32_t offset) const
	{
		assert(ChildCount() > 0);
		PartialLengths::FindResult findResult = lengths.Find(offset);
		assert(findResult.index >= 0);
		assert(findResult.index < ChildCount());
		return { children[findResult.index].get(), findResult.offset };
	}

	void adopt(const std::shared_ptr<MergeNode> &newNode, uint8_t childIndex, bool fWasSplit)
	{
		int iNewLast = ChildCount();
		assert(childIndex <= iNewLast);
		assert(childIndex >= 0);

		for (int i = iNewLast; i > childIndex; i--)
		{
			children[i] = std::move(children[i - 1]);
			children[i]->index = i;
		}
		assert(children[childIndex] == nullptr);

		if (!newNode->isLeaf)
		{
			MergeBlock *newBlock = static_cast<MergeBlock *>(newNode.get());
			if (ChildCount() == 0 || (newBlock->stats.depthMin + 1) > stats.depthMin)
				stats.depthMin = newBlock->stats.depthMin + 1;
			stats.depthMax = std::max(stats.depthMax, static_cast<int8_t>(newBlock->stats.depthMax + 1));

			if (!fWasSplit)
				stats.cDeadSegments += newBlock->stats.cDeadSegments;
		}
		else
		{
			stats.depthMin = 1;
			stats.depthMax = std::max(stats.depthMax, static_cast<int8_t>(1));
		}
		if (ChildCount() + 1 < IdealNodesInBlock)
			stats.depthMin = 0;

		newNode->parent = this;
		newNode->index = static_cast<int8_t>(childIndex);
		children[childIndex] = std::move(newNode);

		if (!fWasSplit)
		{
			// Adopting new content, which changes the length of the whole doc,
			// and means we have to recurse up through parent nodes
			if (children[childIndex]->isLeaf)
			{
				Segment *segment = static_cast<Segment *>(children[childIndex].get());
				lengths.InsertColumn(childIndex);
				lengths.Update(childIndex, segment->length);
				updateParentLengths(segment->length);
			}
			else
			{
				assert(parent == nullptr); // we only get here when splitting the root
				lengths = recomputeLengthsSlow();
			}
		}
		else
		{
			// When a child splits, we don't need to update parents,
			// because our total length hasn't changed
			assert(childIndex > 0);
			if (children[childIndex]->isLeaf)
			{
				Segment *segment = static_cast<Segment *>(children[childIndex].get());
				lengths.SplitColumn(childIndex - 1, segment->length);
			}
			else
			{
				//MergeBlock *block = static_cast<MergeBlock *>(children[childIndex].get());
				lengths = recomputeLengthsSlow();
			}
		}

		checkBlockInvariants();
	}

	void split()
	{
		assert(parent->ChildCount() < MaxNodesInBlock);
		checkBlockInvariants();
		static_assert(MaxNodesInBlock % 2 == 0);
		constexpr int split = MaxNodesInBlock / 2;

		std::shared_ptr<MergeBlock> newBlock = std::make_shared<MergeBlock>(
			children.begin() + split, children.end());
		std::fill(children.begin() + split, children.end(), nullptr);

		lengths = recomputeLengthsSlow();
		assert(split == ChildCount());
		stats = recomputeStatsSlow();

		checkBlockInvariants();
		newBlock->checkBlockInvariants();

		assert(this->index + 1 < MaxNodesInBlock);
		parent->adopt(std::move(newBlock), this->index + 1, true);
	}

	void ensureExtraCapacity(int cNew)
	{
		assert(cNew <= MaxNodesInBlock / 2);
		if (cNew + ChildCount() > MaxNodesInBlock)
		{
			if (parent == nullptr)
			{
				// Looks like we're the root!
				// move contents of root into a child node, and then Split that
				std::shared_ptr<MergeBlock> newBlock = std::make_shared<MergeBlock>(
					begin(), end());

				std::fill(children.begin(), children.end(), nullptr);
				lengths = PartialLengths();
				stats = {};

				adopt(std::move(newBlock), 0, false /*fSplit*/);

				static_cast<MergeBlock *>(children[0].get())->split();
				checkBlockInvariants();
			}
			else
			{
				// Split
				parent->ensureExtraCapacity(1);
				split();
				checkBlockInvariants();
			}
		}

		checkBlockInvariants();
	}

	[[nodiscard]]
	PartialLengths recomputeLengthsSlow()
	{
		// Recompute this, so we don't have to trust the value
		// in the PartialLengths that we're currently rebuilding
		size_t childCount = MaxNodesInBlock - std::count(children.begin(), children.end(), nullptr);

		if (childCount == 0)
			return PartialLengths();

		std::array<PartialLengths::Length, PartialLengths::BlockSize + 1> lengths;
		lengths[0] = 0;
		for (size_t i = 0; i < childCount; i++)
		{
			MergeNode *child = children[i].get();
			assert(child != nullptr);

			PartialLengths::Length len = 0;
			if (child->isLeaf)
			{
				Segment *segment = static_cast<Segment *>(child);
				if (!segment->IsRemoved() && !segment->isDead)
					len = segment->length;
			}
			else
			{
				MergeBlock *block = static_cast<MergeBlock *>(child);
				len = block->lengths.TotalLength();
			}
			lengths[i + 1] = len + lengths[i];
		}

		return PartialLengths(lengths.begin() + 1, lengths.begin() + 1 + childCount);
	}

	[[nodiscard]]
	Stats recomputeStatsSlow()
	{
		Stats stats = {};

		if (!children[0]->isLeaf)
		{
			stats.depthMin = static_cast<MergeBlock *>(children[0].get())->stats.depthMin + 1;
			for (const auto &child : *this)
			{
				MergeBlock *childBlock = static_cast<MergeBlock *>(child.get());
				stats.depthMin = std::min(stats.depthMin, static_cast<int8_t>(childBlock->stats.depthMin + 1));
				stats.depthMax = std::max(stats.depthMax, static_cast<int8_t>(childBlock->stats.depthMax + 1));
				stats.cDeadSegments += childBlock->stats.cDeadSegments;
			}
		}
		else
		{
			stats.depthMin = 1;
			stats.depthMax = 1;

			auto isDead = [](const std::shared_ptr<MergeNode> &node) -> bool { return static_cast<Segment *>(node.get())->isDead; };
			stats.cDeadSegments = static_cast<int8_t>(std::count_if(this->begin(), this->end(), isDead));
		}

		if (ChildCount() == 0)
			stats.depthMax = 0;
		if (ChildCount() < IdealNodesInBlock)
			stats.depthMin = 0;

		return stats;
	}

	void checkBlockInvariants()
	{
#ifdef _DEBUG
		for (int i = 0; i < ChildCount(); i++)
		{
			assert(children[i] != nullptr);
			assert(children[i]->parent == this);
			assert(children[i]->index == i);
		}

		for (int i = ChildCount(); i < MaxNodesInBlock; i++)
			assert(children[i] == nullptr);

		for (int i = 1; i < ChildCount(); i++)
			assert(children[i - 1]->isLeaf == children[i]->isLeaf);

		PartialLengths newLengths = recomputeLengthsSlow();
		assert(newLengths == lengths);

		Stats newStats = recomputeStatsSlow();
		assert(stats.depthMin == newStats.depthMin);
		assert(stats.depthMax == newStats.depthMax);
		assert(stats.depthMax >= stats.depthMin);
		assert(stats.cDeadSegments == newStats.cDeadSegments);
#endif
	}
};

inline void MergeNode::updateParentLengths(int length)
{
	if (parent == nullptr)
		return;

	parent->lengths.Update(this->index, length);
	parent->updateParentLengths(length);
}

struct MergeNodeIterator
{
private:
	MergeNode *m_node;

public:
	MergeNodeIterator() = default;
	MergeNodeIterator(MergeNode *node)
		: m_node(node)
	{}

	MergeNode *Node() const { return m_node; }
	bool IsEnd() const { return m_node == nullptr; }

	bool operator==(const MergeNodeIterator &other) const { return m_node == other.m_node; }
	bool operator!=(const MergeNodeIterator &other) const { return m_node != other.m_node; }

	bool Next()
	{
		if (!m_node)
			return false;

		if (!m_node->isLeaf)
		{
			// move down
			MergeBlock *block = static_cast<MergeBlock *>(m_node);
			assert(block->ChildCount() > 0);
			m_node = block->children[0].get();
			return true;
		}

		auto hasRightSibling = [](const MergeNode *node) -> bool
		{
			return node->parent->ChildCount() > (node->index + 1);
		};

		// Walk up until we find a node to continue with
		while (m_node->parent != nullptr && !hasRightSibling(m_node))
			m_node = m_node->parent;

		if (m_node->parent == nullptr)
		{
			// end of the line if we're back at the root
			m_node = nullptr;
			return false;
		}

		// move sideways
		assert(hasRightSibling(m_node));
		m_node = m_node->parent->children[m_node->index + 1].get();
		return true;
	}
};

struct RawSegmentIterator
{
private:
	MergeNodeIterator m_nodeit;

public:
	RawSegmentIterator() = default;
	RawSegmentIterator(Segment *segment)
		: m_nodeit(segment)
	{}

	::Segment *Segment() const { return static_cast<::Segment *>(m_nodeit.Node()); }
	bool IsEnd() const { return m_nodeit.IsEnd(); }

	bool operator==(const RawSegmentIterator &other) const { return m_nodeit == other.m_nodeit; }
	bool operator!=(const RawSegmentIterator &other) const { return m_nodeit != other.m_nodeit; }

	bool Next()
	{
		while (m_nodeit.Next())
		{
			if (m_nodeit.Node()->isLeaf)
				return true;
		}

		return false;
	}
};

struct SegmentIterator
{
private:
	RawSegmentIterator m_rsegit;

public:
	SegmentIterator() = default;

	SegmentIterator(Segment *segment)
		: m_rsegit(segment)
	{}

	::Segment *Segment() const { return m_rsegit.Segment(); }
	bool IsEnd() const { return m_rsegit.IsEnd(); }

	bool operator==(const SegmentIterator &other) const { return m_rsegit == other.m_rsegit; }
	bool operator!=(const SegmentIterator &other) const { return m_rsegit != other.m_rsegit; }

	bool Next()
	{
		while (m_rsegit.Next())
		{
			::Segment *segment = m_rsegit.Segment();
			if (!segment->IsRemoved())
				return true;
		}

		return false;
	}
};

struct CharacterIterator
{
	SegmentIterator m_segit;
	int offset;

	CharacterIterator()
		: m_segit()
		, offset(0)
	{}

	CharacterIterator(Segment *segment, int offset)
		: m_segit(segment)
		, offset(offset)
	{}

	Segment *Segment() const { return m_segit.Segment(); }
	int OffsetInSegment() const { return offset; }
	bool IsEnd() const { return m_segit.IsEnd(); }
};

struct MergeTree : public IMessageListener
{
	std::shared_ptr<MergeBlock> root;

	std::deque<std::shared_ptr<Edit>> m_edits;
	std::deque<std::shared_ptr<Edit>> m_editsLocal;
	Seq clientSeqNext = Seq::Create(1000);
	ClientId clientLocal = ClientId::Nil();

	IRouterEndpoint *router;

	MergeTree(IRouterEndpoint *router)
		: router(router)
	{
		clientLocal = router->GetLocalClientId();
		router->AddListener(this);

		root = std::make_shared<MergeBlock>();
	}

	CharacterIterator find(CharacterPosition cp)
	{
		MergeNode *currentNode = root.get();
		int currentOffset = 0;

		if (cp == CpMac())
			return CharacterIterator();

		while (!currentNode->isLeaf)
		{
			MergeBlock *block = static_cast<MergeBlock *>(currentNode);
			MergeBlock::FindResult res = block->find(cp.AsInt() - currentOffset);
			currentNode = res.node;
			currentOffset = cp.AsInt() - res.offset;
		}

		return CharacterIterator(static_cast<Segment *>(currentNode), cp.AsInt() - currentOffset);
	}

	SegmentIterator findAndSplit(CharacterPosition cp)
	{
		CharacterIterator it = find(cp);
		if (it.IsEnd())
			return std::move(it.m_segit);

		// Are we already at a boundary?
		if (it.OffsetInSegment() == 0)
			return it.m_segit;

		assert(it.OffsetInSegment() > 0);
		assert(it.OffsetInSegment() < it.Segment()->length);
		it.Segment()->parent->ensureExtraCapacity(1);

		auto newSeg = it.Segment()->splitAt(it.OffsetInSegment());
		it.Segment()->parent->adopt(newSeg, it.Segment()->index + 1, true /*fSplit*/);

		return SegmentIterator(newSeg.get());
	}

	CharacterPosition CpMac() const
	{
		if (root->ChildCount() == 0)
			return CharacterPosition(0);
		return CharacterPosition(root->lengths.TotalLength());
	}

	std::string_view Fetch(CharacterPosition cp)
	{
		CharacterIterator it = find(cp);
		std::string_view svRet = it.Segment()->Text();
		svRet.remove_prefix(it.OffsetInSegment());
		return svRet;
	}

	void Replace(const CharacterPosition cp, const int dcp, std::string_view text, std::shared_ptr<Edit> ed = nullptr)
	{
		bool fLocalEdit = false;
		if (ed == nullptr)
		{
			fLocalEdit = true;
			StartLocalEdit();
			ed = m_editsLocal.back();
		}
		assert(dcp >= 0);

		SegmentIterator it = findAndSplit(cp + dcp);

		// Remove existing text if needed
		if (dcp > 0)
		{
			SegmentIterator it0 = findAndSplit(cp);

			// Mark segments in it0..it as removed in ed
			while (it0 != it)
			{
				Segment *segmentRaw = it0.Segment();
				assert(!segmentRaw->IsRemoved());
				segmentRaw->edRemoved = ed;

				segmentRaw->updateParentLengths(-(segmentRaw->length));

				std::shared_ptr<Segment> segment = std::static_pointer_cast<Segment>(segmentRaw->parent->children[segmentRaw->index]);
				ed->segmentsRemoved.push_back(segment);
				it0.Next();
			}
		}

		if (text.length() > 0)
		{
			std::shared_ptr<Segment> newSegment = std::make_shared<TextSegment>(text);
			newSegment->edAdded = ed;
			ed->segmentsAdded.push_back(newSegment);

			// Insert new segment containing text at the end of the range
			if (it.IsEnd())
			{
				// special case - append new child
				MergeBlock *parent = root.get();
				while (parent->ChildCount() > 0 && !parent->children[0]->isLeaf)
					parent = static_cast<MergeBlock *>(parent->children[parent->ChildCount() - 1].get());

				if (parent->ChildCount() == MergeBlock::MaxNodesInBlock)
				{
					// do a slightly complicated dance to ensure that we keep track of the right parent even if it has to split
					MergeNode *lastChild = parent->children[parent->ChildCount() - 1].get();
					lastChild->parent->ensureExtraCapacity(1);
					parent = lastChild->parent;
				}

				parent->adopt(newSegment, parent->ChildCount(), false /*fSplit*/);
			}
			else
			{
				it.Segment()->parent->ensureExtraCapacity(1);
				it.Segment()->parent->adopt(newSegment, it.Segment()->index, false /*fSplit*/);
			}
		}

		assert(ed->adjustment.cp == CharacterPosition::Invalid());
		ed->adjustment.cp = cp;
		ed->adjustment.dcp = static_cast<int>(text.length()) - dcp;

		if (fLocalEdit)
			SendReplaceOp(cp, dcp, text, ed.get());
	}

	CharacterPosition CpFromSegment(Segment *segment)
	{
		CharacterPosition cp(0);

		MergeNode *node = segment;
		while (node)
		{
			if (node->index > 0)
				cp = cp + node->parent->lengths.LengthAt(node->index - 1);

			node = node->parent;
		}

		return cp;
	}

	void StartLocalEdit()
	{
		auto ed = std::make_shared<Edit>(clientSeqNext, clientLocal);
		m_editsLocal.push_back(ed);
		clientSeqNext = clientSeqNext.next();
	}

	void TardisRangeToServerTip(std::array<CharacterPosition, 2> &cps, Seq refSeq, ClientId client)
	{
		if (m_edits.size() == 0)
			return;

		assert(std::is_sorted(m_edits.begin(), m_edits.end(), OrderEditPtrBySeq));
		auto it = std::upper_bound(m_edits.begin(), m_edits.end(), refSeq, OrderEditPtrBySeq);
		assert(it == m_edits.end() || (*it)->seq == refSeq.next());

		for (; it != m_edits.end(); it++)
		{
			if ((*it)->client == client)
				continue;

			cps[0] = CpAdjustCp(cps[0], (*it)->adjustment, Stick::Right);
			cps[1] = CpAdjustCp(cps[1], (*it)->adjustment, Stick::Right);
		}
	}

	void TardisServerRangeToLocal(std::array<CharacterPosition, 2> &cps)
	{
		for (const std::shared_ptr<Edit> &ed : m_editsLocal)
		{
			cps[0] = CpAdjustCp(cps[0], ed->adjustment, Stick::Left);
			cps[1] = CpAdjustCp(cps[1], ed->adjustment, Stick::Left);
		}
	}

	void RebaseLocalEdits(CharacterPosition cp, int dcp)
	{
		Adjustment adj { cp, dcp };
		for (const std::shared_ptr<Edit> &ed : m_editsLocal)
		{
			auto cpNew = CpAdjustCp(ed->adjustment.cp, adj, Stick::Right);
			ed->adjustment.cp = cpNew;
		}
	}

	void SendReplaceOp(CharacterPosition cp, int dcp, std::string_view text, Edit *ed)
	{
		if (router == nullptr)
			return;

		if (ed->segmentsAdded.size() > 0)
		{
			Message msg;
			msg.clientSequenceNumber = ed->seq;
			msg.referenceSequenceNumber = m_edits.empty() ? Seq::Universal() : m_edits.back()->seq;

			MergeTreeInsertMsg insertMsg;
			insertMsg.pos1 = cp;
			insertMsg.pos2 = cp + dcp;
			insertMsg.text = text;
			msg.contents = std::move(insertMsg);
			
			router->Send(msg);
		}
		else
		{
			assert(false);
		}
	}

	void OnMessageReceived(const SequencedMessage &msg) override
	{
		if (msg.clientId == clientLocal)
		{
			assert(msg.clientSequenceNumber == m_editsLocal.front()->seq);
			m_edits.push_back(std::move(m_editsLocal.front()));
			m_editsLocal.pop_front();
			m_edits.back()->seq = msg.sequenceNumber;
		}
		else
		{
			std::array<CharacterPosition, 2> cps;
			if (std::holds_alternative<MergeTreeInsertMsg>(msg.contents))
			{
				const MergeTreeInsertMsg &insertMsg = std::get<MergeTreeInsertMsg>(msg.contents);
				cps[0] = insertMsg.pos1;
				if (insertMsg.pos2 != CharacterPosition::Invalid())
					cps[1] = insertMsg.pos2;
				else
					cps[1] = cps[0];

				TardisRangeToServerTip(cps, msg.referenceSequenceNumber, msg.clientId);
				TardisServerRangeToLocal(cps);
				std::shared_ptr<Edit> ed = std::make_shared<Edit>(msg.sequenceNumber, msg.clientId);
				m_edits.push_back(ed);
				int dcpRem = cps[1].AsInt() - cps[0].AsInt();
				Replace(cps[0], dcpRem, insertMsg.text, ed);
				RebaseLocalEdits(cps[1], static_cast<int>(dcpRem + insertMsg.text.length()));
			}
			else
			{
				assert(false);
			}
		}

		ClearOldSequenceNumbers(msg.minimumSequenceNumber);
	}

	void ClearOldSequenceNumbers(Seq minSeq)
	{
		auto it = m_edits.begin();
		while (it != m_edits.end() && minSeq > (*it)->seq)
		{
			Edit *ed = it->get();
			std::shared_ptr<Segment> segment;
			for (auto &&weakSegment : ed->segmentsAdded)
			{
				segment = weakSegment.lock();
				assert(segment->edAdded.lock().get() == ed);
				segment->edAdded.reset();
			}

			for (auto &&weakSegment : ed->segmentsRemoved)
			{
				segment = weakSegment.lock();
				assert(segment->edRemoved.lock().get() == ed);
				segment->isDead = true;

				for (MergeBlock *parent = segment->parent; parent != nullptr; parent = parent->parent)
					parent->stats.cDeadSegments++;
			}

			it++;
		}

		m_edits.erase(m_edits.begin(), it);
	}

	void ReloadFromSegments(std::vector<std::shared_ptr<Segment>> segments)
	{
		std::vector<std::shared_ptr<MergeNode>> nodes;
		nodes.reserve(segments.size());
		for (auto&& segment : segments)
			nodes.push_back(std::move(segment));

		std::shared_ptr<MergeBlock> rootBlock = std::make_shared<MergeBlock>();
		ReloadBlockFromNodes(rootBlock.get(), std::move(nodes));
		root = rootBlock;
		checkInvariants();
	}

	void ReloadBlockFromNodes(MergeBlock *rootBlock, std::vector<std::shared_ptr<MergeNode>> nodes)
	{
		while (nodes.size() > MergeBlock::MaxNodesInBlock)
		{
			for (size_t iBegin = 0, iEnd = MergeBlock::MaxNodesInBlock; iBegin < nodes.size(); iBegin = iEnd, iEnd = std::min(iEnd + MergeBlock::MaxNodesInBlock, nodes.size()))
			{
				std::shared_ptr<MergeBlock> block = std::make_shared<MergeBlock>(
					nodes.begin() + iBegin, nodes.begin() + iEnd);
				nodes[iBegin] = std::move(block);
				for (size_t i = iBegin + 1; i < iEnd; i++)
					nodes[i] = nullptr;
			}

			nodes.erase(std::remove(nodes.begin(), nodes.end(), nullptr), nodes.end());
		}
		MergeBlock blockT(nodes.begin(), nodes.end());
		*rootBlock = std::move(blockT);
		rootBlock->checkBlockInvariants();
	}

	// Given an unbalanced block, find the smallest block under it
	// that's still unbalanced. The goal is to rewrite as little
	// of the tree as possible, but still make progress.
	MergeBlock *FindRebalancePoint(MergeBlock *block)
	{
		assert(block->IsUnbalanced());

		MergeBlock *candidate = nullptr;
		for (const auto &childNode : *block)
		{
			if (childNode->isLeaf)
			{
				assert(false);
				return block;
			}

			MergeBlock *childBlock = static_cast<MergeBlock *>(childNode.get());
			if (childBlock->IsUnbalanced())
				return FindRebalancePoint(childBlock);
		}

		return block;
	}

	template <typename TCallback>
	void EnumerateSegments(MergeBlock *block, TCallback callback)
	{
		for (auto &&child : *block)
		{
			if (child->isLeaf)
				callback(child);
			else
				EnumerateSegments(static_cast<MergeBlock *>(child.get()), callback);
		}
	}

	std::vector<std::shared_ptr<MergeNode>> GetSegments(MergeBlock *block)
	{
		std::vector<std::shared_ptr<MergeNode>> nodes;
		EnumerateSegments(block, [&](std::shared_ptr<MergeNode> &node)
		{
			nodes.push_back(node);
		});

		for (auto &&child : *block)
			child = nullptr;

		block->lengths = MergeBlock::PartialLengths();

		return nodes;
	}

	// There are three things that we want to tidy up during idle time:
	// * rebalancing the tree
	// * cleaning up dead segments
	// * merging together adjacent compatible segments
	//
	// So far, we only do the first two
	void RunMaintenance(bool &fKeepGoing)
	{
		RunArborist(fKeepGoing);
	}
	
	// The Arborist maintains the tree by pruning branches that are too long
	void RunArborist(bool &fKeepGoing)
	{
		while (root->IsUnbalanced() && fKeepGoing)
		{
			MergeBlock *block = FindRebalancePoint(root.get());
			std::vector<std::shared_ptr<MergeNode>> nodes = GetSegments(block);

			// trim out dead segments
			auto nodeIsDead = [](const std::shared_ptr<MergeNode> &node) -> bool
			{
				return static_cast<Segment *>(node.get())->isDead;
			};
			nodes.erase(std::remove_if(nodes.begin(), nodes.end(), nodeIsDead), nodes.end());

			ReloadBlockFromNodes(block, std::move(nodes));

			for (MergeBlock *parent = block->parent; parent != nullptr; parent = parent->parent)
				parent->stats = parent->recomputeStatsSlow();
		}
	}

	void checkInvariants()
	{
#ifdef _DEBUG
		std::vector<MergeNode *> stack{ root.get() };

		while (!stack.empty())
		{
			MergeNode *node = stack.back();
			stack.pop_back();

			if (!node->isLeaf)
			{
				static_cast<MergeBlock *>(node)->checkBlockInvariants();

				MergeBlock *block = static_cast<MergeBlock *>(node);
				for (const auto &child : *block)
					stack.push_back(child.get());
			}
		}
#endif
	}
};

