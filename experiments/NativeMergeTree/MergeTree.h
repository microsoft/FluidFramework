#pragma once
#include <memory>
#include <string>
#include <list>
#include <optional>
#include "array_view.h"
#include "Seq.h"
#include "LengthMap.h"

namespace Config
{

constexpr size_t BlockSize()
{
	return 32;
}

}

enum class SegmentType {
	Base,
	Text,
	//	Marker,
	//	External,
};

struct MergeBlock;
struct MergeTree;

struct MergeNode
{
	MergeBlock *parent = nullptr;
	int8_t index = -1; // index in parent's array of children
	bool isLeaf = false;

	MergeNode(bool isLeaf)
		: isLeaf(isLeaf)
	{}

	virtual ~MergeNode() = default;
	virtual void Commit(Seq seqLocal, Seq seqServer) = 0;

protected:
	MergeNode(const MergeNode &) = default;
	MergeNode &operator=(const MergeNode &) = default;
};

struct Segment : public MergeNode
{
	SegmentType m_type;
	int length;
	Seq seqAdded;
	Seq seqRemoved;

	Segment(SegmentType type, int length, Seq seqAdded = Seq::Universal(), Seq seqRemoved = Seq::Invalid())
		: MergeNode(true /*isLeaf*/)
		, m_type(type)
		, length(length)
		, seqAdded(seqAdded)
		, seqRemoved(seqRemoved)
	{}

	virtual ~Segment() = default;
	virtual std::shared_ptr<Segment> splitAt(int pos) = 0;
	void Commit(Seq seqLocal, Seq seqServer) override
	{
		if (seqAdded == seqLocal)
			seqAdded = seqServer;
		if (seqRemoved == seqLocal)
			seqRemoved = seqServer;
	}
};

struct TextSegment final : public Segment
{
	std::string m_text;

	TextSegment(Seq seq, std::string_view text)
		: Segment(SegmentType::Text, text.length(), seq)
		, m_text(text)
	{}

	std::shared_ptr<Segment> splitAt(int pos) override
	{
		if (pos > 0)
		{
			std::string remainingText = m_text.substr(pos);
			m_text.resize(pos);
			length = m_text.size();

			std::shared_ptr<TextSegment> leafSegment = std::make_shared<TextSegment>(*this);
			leafSegment->m_text = std::move(remainingText);
			leafSegment->length = leafSegment->m_text.size();
			return leafSegment;
		}
		return nullptr;
	}
};

struct MergeBlock final : public MergeNode
{
	static constexpr size_t MaxNodesInBlock = Config::BlockSize();
	static constexpr int MaxDepthImbalance = 2;

	using ChildNodeArray = std::array<std::shared_ptr<MergeNode>, MaxNodesInBlock>;
	using LengthMap = TLengthMap<MaxNodesInBlock>;
	ChildNodeArray children;
	LengthMap lengthMap;
	int depthMin = 0;
	int depthMax = 0;

	MergeBlock() : MergeNode(false /*isLeaf*/) {}

	MergeBlock(const MergeBlock &) = delete;
	MergeBlock &operator=(const MergeBlock &) = delete;

	MergeBlock(MergeBlock &&other)
		: MergeNode(false /*isLeaf*/)
		, children(std::move(other.children))
		, lengthMap(std::move(other.lengthMap))
		, depthMin(other.depthMin)
		, depthMax(other.depthMax)
	{
		for (auto&& child : *this)
			child->parent = this;
	}

	template <typename TIter>
	MergeBlock(TIter b, TIter e, 
		std::optional<LengthMap> &&optLengthMap = std::nullopt)
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

		if (optLengthMap.has_value())
			lengthMap = std::move(optLengthMap.value());
		else
			lengthMap = recomputeLengthsSlow();
		depthMin = recomputeDepthMinSlow();
		depthMax = recomputeDepthMaxSlow();
	}

	int ChildCount() const { return lengthMap.ChildCount(); }
	bool isFull() const { return ChildCount() == MaxNodesInBlock; }
	bool IsUnbalanced() const { return (depthMax - depthMin) > MaxDepthImbalance; }
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
		int offset; // offset within the node of the found cp
	};

	MergeBlock::FindResult find(Seq seq, uint32_t offset) const
	{
		assert(ChildCount() > 0);
		LengthMap::FindResult findResult = lengthMap.Find(seq, offset);
		assert(findResult.index >= 0);
		assert(findResult.index < ChildCount());
		return { children[findResult.index].get(), findResult.relOffset };
	}

	void updateParentLengths(Seq seqAdded, Seq seqRemoved, int length)
	{
		if (parent == nullptr)
			return;

		parent->lengthMap.Update(seqAdded, seqRemoved, index, length);
		parent->updateParentLengths(seqAdded, seqRemoved, length);
	}

	void adopt(const std::shared_ptr<MergeNode> &newNode, uint8_t index, bool fWasSplit)
	{
		int iNewLast = ChildCount();
		assert(index <= iNewLast);
		assert(index >= 0);

		for (int i = iNewLast; i > index; i--)
		{
			children[i] = std::move(children[i - 1]);
			children[i]->index = i;
		}
		assert(children[index] == nullptr);

		if (!newNode->isLeaf)
		{
			MergeBlock *newBlock = static_cast<MergeBlock *>(newNode.get());
			if (ChildCount() == 0 || (newBlock->depthMin + 1) > depthMin)
				depthMin = newBlock->depthMin + 1;
			depthMax = std::max(depthMax, newBlock->depthMax + 1);
		}
		else
		{
			depthMin = 1;
			depthMax = std::max(depthMax, 1);
		}
		newNode->parent = this;
		newNode->index = static_cast<int8_t>(index);
		children[index] = std::move(newNode);

		if (!fWasSplit)
		{
			// Adopting new content, which changes the length of the whole doc,
			// and means we have to recurse up through parent nodes
			if (children[index]->isLeaf)
			{
				Segment *segment = static_cast<Segment *>(children[index].get());
				lengthMap.Insert(segment->seqAdded, segment->seqRemoved, index, segment->length);
				updateParentLengths(segment->seqAdded, segment->seqRemoved, segment->length);
			}
			else
			{
				assert(parent == nullptr); // we only get here when splitting the root
				lengthMap = recomputeLengthsSlow();
			}
		}
		else
		{
			// When a child splits, we don't need to update parents,
			// because our total length hasn't changed
			assert(index > 0);
			if (children[index]->isLeaf)
			{
				Segment *segment = static_cast<Segment *>(children[index].get());
				lengthMap.SplitColumn(index - 1, segment->length, segment->seqAdded, segment->seqRemoved);
			}
			else
			{
				MergeBlock *block = static_cast<MergeBlock *>(children[index].get());
				lengthMap = recomputeLengthsSlow();
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
			children.begin() + split, children.end(), lengthMap.Split());

		assert(split == ChildCount());
		for (size_t i = split; i < children.size(); i++)
			children[i] = nullptr;

		depthMin = recomputeDepthMinSlow();
		depthMax = recomputeDepthMaxSlow();

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
					begin(), end(), std::move(lengthMap));

				for (auto &&child : children)
					child = nullptr;
				lengthMap = LengthMap();
				depthMin = 0;
				depthMax = 0;

				adopt(std::move(newBlock), 0, false /*fSplit*/);

				static_cast<MergeBlock *>(children[0].get())->split();
			}
			else
			{
				// Split
				parent->ensureExtraCapacity(1);
				split();
			}
		}

		checkBlockInvariants();
	}

	void Commit(Seq seqLocal, Seq seqServer) override
	{
		lengthMap.Commit(seqLocal, seqServer);
	}

	[[nodiscard]]
	LengthMap recomputeLengthsSlow()
	{
		std::vector<Seq> seqs{ Seq::Universal() };

		// Recompute this, so we don't have to trust the value
		// in the lengthMap that we're currently rebuilding
		size_t childCount = MaxNodesInBlock - std::count(children.begin(), children.end(), nullptr);

		for (size_t i = 0; i < childCount; i++)
		{
			MergeNode *child = children[i].get();
			assert(child != nullptr);
			if (child->isLeaf)
			{
				Segment *segment = static_cast<Segment *>(child);
				const Seq seqAdded = segment->seqAdded;
				const Seq seqRemoved = segment->seqRemoved;
				if (seqAdded != Seq::Invalid() && seqAdded != Seq::Universal())
					seqs.push_back(seqAdded);
				if (seqRemoved != Seq::Invalid())
					seqs.push_back(seqRemoved);
			}
			else
			{
				MergeBlock *block = static_cast<MergeBlock *>(child);
				for (const auto &blockEntry : block->lengthMap.Entries())
				{
					if (blockEntry.GetSeq() != Seq::Universal())
						seqs.push_back(blockEntry.GetSeq());
				}
			}
		}

		std::sort(seqs.begin(), seqs.end());
		for (size_t i = 1; i < seqs.size(); i++)
			if (seqs[i] == seqs[i - 1])
				seqs[i - 1] = Seq::Invalid();
		seqs.erase(std::remove(seqs.begin(), seqs.end(), Seq::Invalid()), seqs.end());

		std::vector<LengthMap::Entry> entries;
		assert(*seqs.begin() == Seq::Universal());
		for (const Seq seq : seqs)
		{
			LengthMap::Entry entry(seq);
			int totalLength = 0;
			for (size_t i = 0; i < childCount; i++)
			{
				MergeNode *child = children[i].get();
				assert(child != nullptr);
				if (child->isLeaf)
				{
					Segment *segment = static_cast<Segment *>(child);
					if (segment->seqAdded <= seq && (segment->seqRemoved == Seq::Invalid() || segment->seqRemoved > seq))
						totalLength += segment->length;
				}
				else
				{
					MergeBlock *block = static_cast<MergeBlock *>(child);
					totalLength += block->lengthMap.GetLength(seq);
				}
				entry.lengths[i] = totalLength;
			}

			entries.push_back(entry);
		}

		return LengthMap(std::move(entries), childCount);
	}

	[[nodiscard]]
	int recomputeDepthMinSlow()
	{
		if (ChildCount() == 0)
			return 0;

		if (children[0]->isLeaf)
			return 1;

		int d = std::numeric_limits<int>::max();
		for (const auto &child : *this)
		{
			MergeBlock *childBlock = static_cast<MergeBlock *>(child.get());
			d = std::min(d, childBlock->depthMin + 1);
		}

		return d;
	}

	[[nodiscard]]
	int recomputeDepthMaxSlow()
	{
		if (ChildCount() == 0)
			return 0;

		if (children[0]->isLeaf)
			return 1;

		int d = 0;
		for (const auto &child : *this)
		{
			MergeBlock *childBlock = static_cast<MergeBlock *>(child.get());
			d = std::max(d, childBlock->depthMax + 1);
		}

		return d;
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

		LengthMap newLengths = recomputeLengthsSlow();
		assert(newLengths == lengthMap);

		int dMin = recomputeDepthMinSlow();
		int dMax = recomputeDepthMaxSlow();
		assert(depthMin == dMin);
		assert(depthMax == dMax);
		assert(depthMax >= depthMin);
#endif
	}
};

struct MergeNodeIterator
{
private:
	MergeNode *m_node = nullptr;

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
		if (!m_node->isLeaf)
		{
			// move down
			MergeBlock *block = static_cast<MergeBlock *>(m_node);
			assert(block->ChildCount() > 0);
			m_node = block->children[0].get();
			return true;
		}

		auto hasRightSibling = [](MergeNode *node) -> bool
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

	Segment *Segment() const { return static_cast<::Segment *>(m_nodeit.Node()); }
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
	Seq m_seq = Seq::Invalid();

public:
	SegmentIterator() = default;

	SegmentIterator(Segment *segment, Seq seq)
		: m_rsegit(segment)
		, m_seq(seq)
	{}

	Seq Seq() const { return m_seq; }
	Segment *Segment() const { return m_rsegit.Segment(); }
	bool IsEnd() const { return m_rsegit.IsEnd(); }

	bool operator==(const SegmentIterator &other) const { return m_rsegit == other.m_rsegit; }
	bool operator!=(const SegmentIterator &other) const { return m_rsegit != other.m_rsegit; }

	bool Next()
	{
		while (m_rsegit.Next())
		{
			::Segment *segment = m_rsegit.Segment();
			if (segment->seqAdded <= m_seq && segment->seqRemoved > m_seq)
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

	CharacterIterator(Seq seq, Segment *segment, int offset)
		: m_segit(segment, seq)
		, offset(offset)
	{}

	Seq Seq() const { return m_segit.Seq(); }
	Segment *Segment() const { return m_segit.Segment(); }
	int OffsetInSegment() const { return offset; }
	bool IsEnd() const { return m_segit.IsEnd(); }
};

struct Transaction
{
	Seq seqBase;
	Seq seqNew;
	std::vector<Segment *> segments;

	Transaction(Seq seqBase, Seq seqNew)
		: seqBase(seqBase)
		, seqNew(seqNew)
	{}
};

struct MergeTree
{
	MergeBlock root;

	using Txn = Transaction *; // TODO: void*?
	std::list<Transaction> m_txns;
	Seq m_seqNextLocal = Seq::LocalFirst();

	MergeTree() {}

	CharacterIterator find(Seq seqBase, CharacterPosition cp)
	{
		MergeNode *currentNode = &root;
		int currentOffset = 0;

		if (cp == CpMac(seqBase))
			return CharacterIterator();

		while (!currentNode->isLeaf)
		{
			MergeBlock *block = static_cast<MergeBlock *>(currentNode);
			MergeBlock::FindResult res = block->find(seqBase, cp.AsInt() - currentOffset);
			currentNode = res.node;
			currentOffset = cp.AsInt() - res.offset;
		}

		return CharacterIterator(seqBase, static_cast<Segment *>(currentNode), cp.AsInt() - currentOffset);
	}

	SegmentIterator findAndSplit(Seq seqBase, CharacterPosition cp)
	{
		CharacterIterator it = find(seqBase, cp);
		if (it.IsEnd())
			return std::move(it.m_segit);

		assert(!it.IsEnd());

		assert(it.OffsetInSegment() > 0);
		assert(it.OffsetInSegment() < it.Segment()->length);
		it.Segment()->parent->ensureExtraCapacity(1);

		auto newSeg = it.Segment()->splitAt(it.OffsetInSegment());
		auto newSegPtr = newSeg.get();
		it.Segment()->parent->adopt(std::move(newSeg), it.Segment()->index + 1, true /*fSplit*/);

		return SegmentIterator(newSegPtr, seqBase);
	}

	Seq seqAllocLocal()
	{
		Seq seqNew = m_seqNextLocal;
		m_seqNextLocal = m_seqNextLocal.next();
		return seqNew;
	}

	Txn StartTransaction(Seq seqBase)
	{
		m_txns.emplace_back(seqBase, seqAllocLocal());
		return &m_txns.back();
	}

	void CommitTransaction(Txn txn, Seq seqServer)
	{
		assert(txn->seqNew == root.lengthMap.SeqFirstLocal()); // TODO: need a real check, not just an assert
		assert(txn == &m_txns.front());
		const Seq seqLocal = txn->seqNew;

		for (Segment *segment : txn->segments)
		{
			segment->Commit(seqLocal, seqServer);

			MergeBlock *parent = segment->parent;
			while (parent != nullptr)
			{
				parent->Commit(seqLocal, seqServer);
				parent = parent->parent;
			}
		}

		m_txns.pop_front();
	}

	CharacterPosition CpMac(Seq seq) const
	{
		if (root.ChildCount() == 0)
			return CharacterPosition(0);
		return CharacterPosition(root.lengthMap.GetLength(seq));
	}

	std::string_view Fetch(Seq seqBase, CharacterPosition cp)
	{
		CharacterIterator it = find(seqBase, cp);
		std::string_view svRet = static_cast<TextSegment *>(it.Segment())->m_text;
		svRet.remove_prefix(it.OffsetInSegment());
		return svRet;
	}

	void Replace(Txn txn, CharacterPosition cp, int dcp, std::string_view text)
	{
		assert(dcp >= 0);

		SegmentIterator it = findAndSplit(txn->seqBase, cp + dcp);
		std::shared_ptr<Segment> newSegment = std::make_shared<TextSegment>(txn->seqNew, text);

		// Remove existing text if needed
		if (dcp > 0)
		{
			SegmentIterator it0 = findAndSplit(txn->seqBase, cp);

			// Mark segments in it0..it as removed in txn.seqNew
			while (it0 != it)
			{
				Segment *segment = it0.Segment();
				// segment->seqRemoved is almost certainly Seq::Invalid() here.
				// but in case the segment was already removed in another transaction, handle the case where it's not.
				segment->parent->lengthMap.Update(txn->seqNew, segment->seqRemoved, segment->index, -segment->length);
				segment->parent->updateParentLengths(txn->seqNew, segment->seqRemoved, -segment->length);
				segment->seqRemoved = txn->seqNew;
				it0.Next();
			}
		}

		// Insert new segment containing text at the end of the range
		if (it.IsEnd())
		{
			// special case - append new child
			MergeBlock *parent = &root;
			while (parent->ChildCount() > 0 && !parent->children[0]->isLeaf)
				parent = static_cast<MergeBlock *>(parent->children[parent->ChildCount() - 1].get());

			if (parent->ChildCount() == MergeBlock::MaxNodesInBlock)
			{
				// do a slightly complicated dance to ensure that we keep track of the right parent even if it has to split
				MergeNode *lastChild = parent->children[parent->ChildCount() - 1].get();
				lastChild->parent->ensureExtraCapacity(1);
				parent = lastChild->parent;
			}

			txn->segments.push_back(newSegment.get());
			parent->adopt(std::move(newSegment), parent->ChildCount(), false /*fSplit*/);
		}
		else
		{
			it.Segment()->parent->ensureExtraCapacity(1);
			txn->segments.push_back(newSegment.get());
			it.Segment()->parent->adopt(std::move(newSegment), it.Segment()->index, false /*fSplit*/);
		}
	}

	Seq SeqLastUsed() const
	{
		return root.lengthMap.Entries().back().GetSeq();
	}

	void ReloadFromSegments(std::vector<std::shared_ptr<Segment>> segments)
	{
		std::vector<std::shared_ptr<MergeNode>> nodes;
		nodes.reserve(segments.size());
		for (auto&& segment : segments)
			nodes.push_back(std::move(segment));

		ReloadBlockFromNodes(&root, std::move(nodes));
	}

	void ReloadBlockFromNodes(MergeBlock *rootBlock, std::vector<std::shared_ptr<MergeNode>> nodes)
	{
		// Given a range of indexes in 'nodes', move the elements from
		// those indexes into a new block, and put that block back into
		// 'nodes' at iBegin
		auto fillBlock = [&nodes](MergeBlock *block, size_t iBegin, size_t iEnd) -> void
		{
			for (size_t i = iBegin + 1; i < iEnd; i++)
				assert(nodes[i - 1]->isLeaf == nodes[i]->isLeaf);
			uint32_t childCount = static_cast<uint32_t>(iEnd - iBegin);
			assert(childCount > 0);
			assert(childCount <= MergeBlock::MaxNodesInBlock);

			std::move(nodes.begin() + iBegin, nodes.begin() + iEnd, block->children.begin());
			for (size_t i = 0; i < childCount; i++)
			{
				block->children[i]->parent = block;
				block->children[i]->index = static_cast<uint8_t>(i);
			}
			block->lengthMap = block->recomputeLengthsSlow();
			if (block->children[0]->isLeaf)
			{
				block->depthMin = 1;
				block->depthMax = 1;
			}
			else
			{
				MergeBlock *childBlock = static_cast<MergeBlock*>(block->children[0].get());
				block->depthMin = childBlock->depthMin + 1;
				block->depthMax = childBlock->depthMax + 1;
			}
		};

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
		fillBlock(rootBlock, 0, nodes.size());
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

	std::vector<std::shared_ptr<MergeNode>> ExtractSegments(MergeBlock *block)
	{
		std::vector<std::shared_ptr<MergeNode>> nodes;
		EnumerateSegments(block, [&](std::shared_ptr<MergeNode> &node)
		{
			nodes.push_back(std::move(node));
		});

		for (auto &&child : *block)
			child = nullptr;

		block->lengthMap = MergeBlock::LengthMap();

		return nodes;
	}

	// There are three things that we want to tidy up during idle time:
	// * rebalancing the tree
	// * cleaning up dead segments
	// * merging together adjacent compatible segments
	//
	// So far, we only do the first one
	void Zamboni(bool &fKeepGoing)
	{
		while (root.IsUnbalanced() && fKeepGoing)
		{
			MergeBlock *block = FindRebalancePoint(&root);
			std::vector<std::shared_ptr<MergeNode>> nodes = ExtractSegments(block);
			// TODO: now would be a good time to trim out dead segments
			ReloadBlockFromNodes(block, std::move(nodes));
		}
	}

	void checkInvariants()
	{
#ifdef _DEBUG
		std::vector<MergeNode *> stack{ &root };

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

