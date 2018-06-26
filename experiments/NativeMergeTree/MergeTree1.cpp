#include <string>
#include <vector>
#include <memory>
#include <optional>
#include <array>
#include <cassert>

struct IHierBlock;
struct PartialSequenceLengths;
struct SegmentGroup;
struct MergeTree;
struct MergeNode;

enum class SegmentType {
    Base,
    Text,
    Marker,
    External
};

struct RemovalInfo {
    std::optional<int> removedSeq;
    std::optional<int> removedClientId;
    std::optional<std::vector<int>>removedClientOverlap;
};

struct MergeNode {
	MergeBlock *parent = nullptr;
	int cachedLength;
	int index;
	std::string ordinal;
	virtual bool isLeaf() = 0;
};

struct PropertySet {}; // TODO

struct LocalReference
{
	int offset;
	// TODO
};

using LocalReferencePtr = std::shared_ptr<LocalReference>;

struct Segment : public MergeNode, public RemovalInfo {
	SegmentGroup *segmentGroup;
	std::optional<int> seq;  // if not present assumed to be previous to window min
	std::optional<int> clientId;
	std::vector<LocalReferencePtr> localRefs;
	std::vector<RemovalInfo> removalsByBranch;

	Segment(std::optional<int> seq, std::optional<int> clientId)
		: seq(seq), clientId(clientId)
	{}

	PropertySet properties;
	std::optional<int> hierRefCount;

	virtual std::unique_ptr<Segment> splitAt(int pos) = 0;
	virtual bool canAppend(Segment *segment, const MergeTree &mergeTree) = 0;
	virtual void append(std::unique_ptr<Segment> segment) = 0;
	virtual SegmentType getType() = 0;
	virtual bool removeRange(int start, int end) = 0;

	void addLocalRef(const LocalReferencePtr &lref) {
#if NOTYET
		if ((hierRefCount == std::nullopt) || (hierRefCount == 0)) {
			if (lref->hasRangeLabels() || lref->hasTileLabels()) {
				hierRefCount = 1;
			}
		}
#endif
		auto it = std::find_if(localRefs.begin(), localRefs.end(),
			[&](const LocalReferencePtr &ref)
			{
			return ref->offset > lref->offset;
			});
		localRefs.insert(it, lref);
	}

	LocalReferencePtr removeLocalRef(const LocalReferencePtr &lref) {
		auto it = std::find(localRefs.begin(), localRefs.end(), lref);
		if (it == localRefs.end())
			return nullptr;

		localRefs.erase(it);
		return lref;
	}

#if NOTYET
	addProperties(newProps: Properties.PropertySet, op ? : ops.ICombiningOp, seq ? : number) {
		this.properties = Properties.addProperties(this.properties, newProps, op, seq);
	}

	hasProperty(key: string) {
		return this.properties && (this.properties[key] != = undefined);
	}
#endif
	bool isLeaf() override {
		return true;
	}

#if NOTYET
	cloneInto(b: BaseSegment) {
		b.clientId = this.clientId;
		// TODO: deep clone properties
		b.properties = Properties.extend(Properties.createMap<any>(), this.properties);
		b.removedClientId = this.removedClientId;
		// TODO: copy removed client overlap and branch removal info
		b.removedSeq = this.removedSeq;
		b.seq = this.seq;
	}

	canAppend(segment: Segment, mergeTree : MergeTree) {
		return false;
	}

	abstract clone() : BaseSegment;
#endif
};

struct TextSegment : public Segment {
	static std::unique_ptr<TextSegment> make(const std::string &text, const PropertySet *props, std::optional<int> seq, std::optional<int> clientId) {
		auto tseg = std::make_unique<TextSegment>(text, seq, clientId);
#if NOTYET
		if (props) {
			tseg.addProperties(props);
		}
#endif
		return tseg;
	}

	std::string text;

	TextSegment(const std::string &text, std::optional<int> seq, std::optional<int> clientId)
		: Segment(seq, clientId)
		, text(text)
	{
		cachedLength = text.length;
	}

	void splitLocalRefs(int pos, TextSegment *leafSegment) {
		auto it = std::remove_if(localRefs.begin(), localRefs.end(), 
			[pos](const LocalReferencePtr &lref)
			{
			return lref->offset >= pos;
			});

		leafSegment->localRefs.assign(it, localRefs.end());
		localRefs.erase(it, localRefs.end());
	}

	std::unique_ptr<Segment> splitAt(int pos) override {
		if (pos > 0) {
			std::string remainingText = text.substr(pos);
			text = text.substr(0, pos);
			cachedLength = text.length;
			auto leafSegment = std::make_unique<TextSegment>(remainingText, seq, clientId);
#if NOTYET
			if (this.properties) {
				leafSegment.addProperties(Properties.extend(Properties.createMap<any>(), this.properties));
			}
#endif
			segmentCopy(this, leafSegment, true);
			splitLocalRefs(pos, leafSegment.get());
			return leafSegment;
		}

		return nullptr;
	}

	clone(start = 0, end ? : number) {
		let text = this.text;
		if (end == = undefined) {
			text = text.substring(start);
		}
		else {
			text = text.substring(start, end);
		}
		let b = TextSegment.make(text, this.properties, this.seq, this.clientId);
		this.cloneInto(b);
		return b;
	}

	getType() {
		return SegmentType.Text;
	}

	// TODO: use function in properties.ts
	matchProperties(b: TextSegment) {
		if (this.properties) {
			if (!b.properties) {
				return false;
			}
			else {
				let bProps = b.properties;
				// for now, straightforward; later use hashing
				for (let key in this.properties) {
					if (bProps[key] == = undefined) {
						return false;
					}
					else if (bProps[key] != = this.properties[key]) {
						return false;
					}
				}
				for (let key in bProps) {
					if (this.properties[key] == = undefined) {
						return false;
					}
				}
			}
		}
		else {
			if (b.properties) {
				return false;
			}
		}
		return true;
	}

	canAppend(segment: Segment, mergeTree : MergeTree) {
		if ((!this.removedSeq) && (this.text.charAt(this.text.length - 1) != '\n')) {
			if (segment.getType() == = SegmentType.Text) {
				if (this.matchProperties(<TextSegment>segment)) {
					let branchId = mergeTree.getBranchId(this.clientId);
					let segBranchId = mergeTree.getBranchId(segment.clientId);
					if ((segBranchId == = branchId) && (mergeTree.localNetLength(segment) > 0)) {
						return ((this.cachedLength <= MergeTree.TextSegmentGranularity) ||
							(segment.cachedLength <= MergeTree.TextSegmentGranularity));
					}
				}
			}
		}
		return false;
	}

	toString() {
		return this.text;
	}

	append(segment: Segment) {
		if (segment.getType() == = SegmentType.Text) {
			if (segment.localRefs) {
				let adj = this.text.length;
				for (let localRef of segment.localRefs) {
					localRef.offset += adj;
					localRef.segment = this;
				}
			}
			this.text += (<TextSegment>segment).text;
			this.cachedLength = this.text.length;
			return this;
		}
		else {
			throw new Error("can only append text segment");
		}
	}

	// TODO: retain removed text for undo
	// returns true if entire string removed
	removeRange(start: number, end : number) {
		let remnantString = "";
		let len = this.text.length;
		if (start > 0) {
			remnantString += this.text.substring(0, start);
		}
		if (end < len) {
			remnantString += this.text.substring(end);
		}
		this.text = remnantString;
		this.cachedLength = remnantString.length;
		return (remnantString.length == 0);
	}
};

inline constexpr size_t MaxNodesInBlock = 8;

// node with segments as children
struct MergeBlock : public MergeNode {
    static constexpr bool traceOrdinals = false;
	int childCount;
	std::vector<std::unique_ptr<MergeNode>> children;
	std::unique_ptr<PartialSequenceLengths> partialLengths;

    MergeBlock(size_t childCount) {
        this->childCount = childCount;
    }

	void setOrdinal(MergeNode *child, int index) {
        int childCount = this->childCount;
        if (childCount == 8) {
            childCount = 7;
        }
        assert((childCount >= 1) && (childCount <= 7));
        int localOrdinal;
        int ordinalWidth = 1 << (MaxNodesInBlock - (childCount + 1));
        if (index == 0) {
            localOrdinal = ordinalWidth - 1;
        } else {
            const std::string &prevOrd = children[index - 1]->ordinal;
            char prevOrdCode = prevOrd[prevOrd.length - 1];
            localOrdinal = prevOrdCode + ordinalWidth;
        }
        child->ordinal = this->ordinal + char(localOrdinal);
        assert(child->ordinal.length() == this->ordinal.length() + 1);
        if (index > 0) {
            assert(child->ordinal > this->children[index - 1]->ordinal);
        }
    }

	void assignChild(std::unique_ptr<MergeNode> child, int index, bool updateOrdinal) {
        child->parent = this;
        child->index = index;
        if (updateOrdinal) {
            setOrdinal(child.get(), index);
        }
        children[index] = std::move(child);
    }
};

// represents a sequence of text segments
struct MergeTree {
	// must be an even number   
	inline static int TextSegmentGranularity = 128;
	inline static int zamboniSegmentsMaxCount = 2;
	inline static struct {
		bool incrementalUpdate = true;
		bool zamboniSegments = true;
		bool measureWindowTime = true;
		bool measureOrdinalTime = true;
	} options;
	inline static int searchChunkSize = 256;
	inline static bool traceAppend = false;
	inline static bool traceZRemove = false;
	inline static bool traceOrdinals = false;
	inline static bool traceGatherText = false;
	inline static bool diagInsertTie = false;
	inline static bool skipLeftShift = true;
	inline static bool diagOverlappingRemove = false;
	inline static bool traceTraversal = false;
	inline static bool traceIncrTraversal = false;
//	static initBlockUpdateActions: BlockUpdateActions;
//	static theUnfinishedNode = <IMergeBlock>{ childCount: -1 };

	int windowTime = 0;
	int packTime = 0;
	int ordTime = 0;
	int maxOrdTime = 0;

	std::unique_ptr<MergeBlock> root;
	static constexpr bool blockUpdateMarkers = false;
//	blockUpdateActions: BlockUpdateActions;
#if NOTYET
	collabWindow = new CollaborationWindow();
	pendingSegments: Collections.List<SegmentGroup>;
	segmentsToScour: Collections.Heap<LRUSegment>;
	// TODO: change this to ES6 map; add remove on segment remove
	// for now assume only markers have ids and so point directly at the Segment 
	// if we need to have pointers to non-markers, we can change to point at local refs
	idToSegment = Properties.createMap<Segment>();
	localIdToSegment = Properties.createMap<Segment>();
	clientIdToBranchId: number[] = [];
	localBranchId = 0;
	markerModifiedHandler: IMarkerModifiedAction;
	transactionSegmentGroup: SegmentGroup;
	minSeqListeners: Collections.Heap<MinListener>;
	minSeqPending = false;
	// for diagnostics
	getLongClientId: (id: number) = > string;
	getUserInfo: (id: number) = > IAuthenticatedUser;

	// TODO: make and use interface describing options
	constructor(public text: string, public options ? : Properties.PropertySet) {
		this.blockUpdateActions = MergeTree.initBlockUpdateActions;
		if (options) {
			if (options.blockUpdateMarkers) {
				this.blockUpdateMarkers = options.blockUpdateMarkers;
			}
			if (options.localMinSeq != = undefined) {
				this.collabWindow.localMinSeq = options.localMinSeq;
			}
		}
		this.root = this.initialTextNode(this.text);
	}

#endif // NOTYET
	std::unique_ptr<MergeBlock> makeBlock(int childCount) {
		std::unique_ptr<MergeBlock> block = std::make_unique<MergeBlock>(childCount);
		block->ordinal = "";
		return block;
	}

	std::unique_ptr<MergeBlock> initialTextNode(const std::string &text) {
		auto block = makeBlock(1);
		block->ordinal = "";
		block->assignChild(new TextSegment(text, UniversalSequenceNumber, LocalClientId), 0);
		block->cachedLength = text.length;
		return block;
	}

#if NOTYET
	blockCloneFromSegments(block: IMergeBlock, segments : Segment[]) {
		for (let i = 0; i < block.childCount; i++) {
			let child = block.children[i];
			if (child.isLeaf()) {
				segments.push(this.segmentClone(<Segment>block.children[i]));
			}
			else {
				this.blockCloneFromSegments(<IMergeBlock>child, segments);
			}
		}
	}

	clone() {
		let options = {
		blockUpdateMarkers: this.blockUpdateMarkers,
							localMinSeq : this.collabWindow.localMinSeq
		};
		let b = new MergeTree("", options);
		// for now assume that b will not collaborate
		b.root = b.blockClone(this.root);
	}

	blockClone(block: IMergeBlock) {
		let bBlock = this.makeBlock(block.childCount);
		for (let i = 0; i < block.childCount; i++) {
			let child = block.children[i];
			if (child.isLeaf()) {
				bBlock.children[i] = this.segmentClone(<Segment>block.children[i]);
			}
			else {
				bBlock.children[i] = this.blockClone(<IMergeBlock>block.children[i]);
			}
		}
		this.nodeUpdateLengthNewStructure(bBlock);
		return bBlock;
	}

	segmentClone(segment: Segment) {
		let b = (<BaseSegment>segment).clone();
		return b;
	}

	startGroupOperation(liveSegmentGroup ? : SegmentGroup) {
		// TODO: assert undefined
		if (this.collabWindow.collaborating) {
			if (liveSegmentGroup) {
				this.transactionSegmentGroup = liveSegmentGroup;
			}
			else {
				this.transactionSegmentGroup = <SegmentGroup>{ segments: [] };
				this.pendingSegments.enqueue(this.transactionSegmentGroup);
			}
			return this.transactionSegmentGroup;
		}
	}

	endGroupOperation() {
		if (this.collabWindow.collaborating) {
			this.transactionSegmentGroup = undefined;
		}
	}

	localNetLength(segment: Segment) {
		let segBranchId = this.getBranchId(segment.clientId);
		let removalInfo = <IRemovalInfo>segment;
		if (this.localBranchId > segBranchId) {
			removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, segment);
		}
		if (removalInfo.removedSeq != = undefined) {
			return 0;
		}
		else {
			return segment.cachedLength;
		}
	}

	getBranchId(clientId: number) {
		if ((this.clientIdToBranchId.length > clientId) && (clientId >= 0)) {
			return this.clientIdToBranchId[clientId];
		}
		else if (clientId == = LocalClientId) {
			return 0;
		}
		else {
			return this.localBranchId;
		}
	}

	// TODO: remove id when segment removed 
	mapIdToSegment(id: string, segment : Segment) {
		this.idToSegment[id] = segment;
	}

	mapLocalIdToSegment(id: string, segment : Segment) {
		this.localIdToSegment[id] = segment;
	}

	addNode(block: IMergeBlock, node : MergeNode) {
		let index = block.childCount++;
		block.assignChild(node, index, false);
		return index;
	}

	reloadFromSegments(segments: Segment[]) {
		let segCap = MaxNodesInBlock - 1;
		const measureReloadTime = false;
		let buildMergeBlock : (nodes: MergeNode[]) = > IMergeBlock = (nodes: Segment[]) = > {
			const nodeCount = Math.ceil(nodes.length / segCap);
			const blocks : IMergeBlock[] = [];
			let nodeIndex = 0;
			for (let i = 0; i < nodeCount; i++) {
				let len = 0;
				blocks[i] = this.makeBlock(0);
				for (let j = 0; j < segCap; j++) {
					if (nodeIndex < nodes.length) {
						let childIndex = this.addNode(blocks[i], nodes[nodeIndex]);
						len += nodes[nodeIndex].cachedLength;
						if (this.blockUpdateMarkers) {
							let hierBlock = blocks[i].hierBlock();
							hierBlock.addNodeReferences(this, nodes[nodeIndex]);
						}
						if (this.blockUpdateActions) {
							this.blockUpdateActions.child(blocks[i], childIndex);
						}
					}
					else {
						break;
					}
					nodeIndex++;
				}
				blocks[i].cachedLength = len;
			}
			if (blocks.length == 1) {
				return blocks[0];
			}
			else {
				return buildMergeBlock(blocks);
			}
		}
		let clockStart;
		if (measureReloadTime) {
			clockStart = clock();
		}
		if (segments.length > 0) {
			this.root = this.makeBlock(1);
			let block = buildMergeBlock(segments);
			this.root.assignChild(block, 0, false);
			if (this.blockUpdateMarkers) {
				let hierRoot = this.root.hierBlock();
				hierRoot.addNodeReferences(this, block);
			}
			if (this.blockUpdateActions) {
				this.blockUpdateActions.child(this.root, 0);
			}
			this.nodeUpdateOrdinals(this.root);
			this.root.cachedLength = block.cachedLength;
		}
		else {
			this.root = this.makeBlock(0);
			this.root.cachedLength = 0;
		}
		this.root.index = 0;
		if (measureReloadTime) {
			console.log(`reload time ${ elapsedMicroseconds(clockStart) }`);
		}
	}

	// for now assume min starts at zero
	startCollaboration(localClientId: number, minSeq : number, branchId : number) {
		this.collabWindow.clientId = localClientId;
		this.collabWindow.minSeq = minSeq;
		this.collabWindow.collaborating = true;
		this.collabWindow.currentSeq = minSeq;
		this.localBranchId = branchId;
		this.segmentsToScour = new Collections.Heap<LRUSegment>([], LRUSegmentComparer);
		this.pendingSegments = Collections.ListMakeHead<SegmentGroup>();
		let measureFullCollab = false;
		let clockStart;
		if (measureFullCollab) {
			clockStart = clock();
		}
		this.nodeUpdateLengthNewStructure(this.root, true);
		if (measureFullCollab) {
			console.log(`update partial lengths at start ${ elapsedMicroseconds(clockStart) }`);
		}
	}

	addToLRUSet(segment: Segment, seq : number) {
		this.segmentsToScour.add({ segment: segment, maxSeq : seq });
	}

	underflow(node: IMergeBlock) {
		return node.childCount < (MaxNodesInBlock / 2);
	}

	scourNode(node: IMergeBlock, holdNodes : MergeNode[]) {
		let prevSegment : Segment;
		for (let k = 0; k < node.childCount; k++) {
			let childNode = node.children[k];
			if (childNode.isLeaf()) {
				let segment = <Segment>childNode;
				if ((segment.removedSeq != = undefined) && (segment.removedSeq != = UnassignedSequenceNumber)) {
					let createBrid = this.getBranchId(segment.clientId);
					let removeBrid = this.getBranchId(segment.removedClientId);
					if ((removeBrid != createBrid) || (segment.removedSeq > this.collabWindow.minSeq)) {
						holdNodes.push(segment);
					}
					else {
						if (MergeTree.traceZRemove) {
							console.log(`${this.getLongClientId(this.collabWindow.clientId)
						}: Zremove ${ (<TextSegment>segment).text }; cli ${ this.getLongClientId(segment.clientId) }`);
					}
					segment.parent = undefined;
				}
				prevSegment = undefined;
			}
			else {
				if ((segment.seq <= this.collabWindow.minSeq) &&
					(!segment.segmentGroup) && (segment.seq != UnassignedSequenceNumber)) {
					if (prevSegment && prevSegment.canAppend(segment, this)) {
						if (MergeTree.traceAppend) {
							console.log(`${this.getLongClientId(this.collabWindow.clientId)
						}: append ${ (<TextSegment>prevSegment).text } +${ (<TextSegment>segment).text }; cli ${ this.getLongClientId(prevSegment.clientId) } +cli ${ this.getLongClientId(segment.clientId) }`);
					}
					prevSegment.append(segment);
					segment.parent = undefined;
				}
				else {
					holdNodes.push(segment);
					if (this.localNetLength(segment) > 0) {
						prevSegment = segment;
					}
					else {
						prevSegment = undefined;
					}
				}
			}
					else {
						holdNodes.push(segment);
						prevSegment = undefined;
					}
		}
	}
			else {
				holdNodes.push(childNode);
				prevSegment = undefined;
			}
}
	}

	// interior node with all node children
	pack(block: IMergeBlock) {
		let parent = block.parent;
		let children = parent.children;
		let childIndex : number;
		let childBlock : IMergeBlock;
		let holdNodes = <MergeNode[]>[];
		for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
			// debug assert not isLeaf()
			childBlock = <IMergeBlock>children[childIndex];
			this.scourNode(childBlock, holdNodes);
			// will replace this block with a packed block
			childBlock.parent = undefined;
		}
		let totalNodeCount = holdNodes.length;
		let halfCount = MaxNodesInBlock / 2;
		let childCount = Math.min(MaxNodesInBlock - 1, Math.floor(totalNodeCount / halfCount));
		if (childCount < 1) {
			childCount = 1;
		}
		let baseCount = Math.floor(totalNodeCount / childCount);
		let extraCount = totalNodeCount % childCount;
		let packedBlocks = <IMergeBlock[]>new Array(MaxNodesInBlock);
		let readCount = 0;
		for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
			let nodeCount = baseCount;
			if (extraCount > 0) {
				nodeCount++;
				extraCount--;
			}
			let packedBlock = this.makeBlock(nodeCount);
			for (let packedNodeIndex = 0; packedNodeIndex < nodeCount; packedNodeIndex++) {
				let nodeToPack = holdNodes[readCount++];
				packedBlock.assignChild(nodeToPack, packedNodeIndex, false);
			}
			packedBlock.parent = parent;
			packedBlocks[nodeIndex] = packedBlock;
			this.nodeUpdateLengthNewStructure(packedBlock);
		}
		if (readCount != totalNodeCount) {
			console.log(`total count ${ totalNodeCount } readCount ${ readCount }`);
		}
		parent.children = packedBlocks;
		for (let j = 0; j < childCount; j++) {
			parent.assignChild(packedBlocks[j], j, false);
		}
		parent.childCount = childCount;
		if (this.underflow(parent) && (parent.parent)) {
			this.pack(parent);
		}
		else {
			this.nodeUpdateOrdinals(parent);
			this.blockUpdatePathLengths(parent, UnassignedSequenceNumber, -1, true);
		}
	}

	zamboniSegments() {
		//console.log(`scour line ${segmentsToScour.count()}`);
		let clockStart;
		if (MergeTree.options.measureWindowTime) {
			clockStart = clock();
		}

		let segmentToScour = this.segmentsToScour.peek();
		if (segmentToScour && (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
			for (let i = 0; i < MergeTree.zamboniSegmentsMaxCount; i++) {
				segmentToScour = this.segmentsToScour.get();
				if (segmentToScour && segmentToScour.segment.parent &&
					(segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
					let block = segmentToScour.segment.parent;
					let childrenCopy = <MergeNode[]>[];
					//                console.log(`scouring from ${segmentToScour.segment.seq}`);
					this.scourNode(block, childrenCopy);
					let newChildCount = childrenCopy.length;

					if (newChildCount < block.childCount) {
						block.childCount = newChildCount;
						block.children = childrenCopy;
						for (let j = 0; j < newChildCount; j++) {
							block.assignChild(childrenCopy[j], j, false);
						}

						if (this.underflow(block) && block.parent) {
							//nodeUpdatePathLengths(node, UnassignedSequenceNumber, -1, true);
							let packClockStart;
							if (MergeTree.options.measureWindowTime) {
								packClockStart = clock();
							}
							this.pack(block);

							if (MergeTree.options.measureWindowTime) {
								this.packTime += elapsedMicroseconds(packClockStart);
							}
						}
						else {
							this.nodeUpdateOrdinals(block);
							this.blockUpdatePathLengths(block, UnassignedSequenceNumber, -1, true);
						}

					}
				}
				else {
					break;
				}
			}
		}

		if (MergeTree.options.measureWindowTime) {
			this.windowTime += elapsedMicroseconds(clockStart);
		}
	}

	getCollabWindow() {
		return this.collabWindow;
	}

	getStats() {
		let nodeGetStats = (block: IMergeBlock) = > {
			let stats = { maxHeight: 0, nodeCount : 0, leafCount : 0, removedLeafCount : 0, liveCount : 0, histo : [] };
			for (let k = 0; k < MaxNodesInBlock; k++) {
				stats.histo[k] = 0;
			}
			for (let i = 0; i < block.childCount; i++) {
				let child = block.children[i];
				let height = 1;
				if (!child.isLeaf()) {
					let childStats = nodeGetStats(<IMergeBlock>child);
					height = 1 + childStats.maxHeight;
					stats.nodeCount += childStats.nodeCount;
					stats.leafCount += childStats.leafCount;
					stats.removedLeafCount += childStats.removedLeafCount;
					stats.liveCount += childStats.liveCount;
					for (let i = 0; i < MaxNodesInBlock; i++) {
						stats.histo[i] += childStats.histo[i];
					}
				}
				else {
					stats.leafCount++;
					let segment = <Segment>child;
					if (segment.removedSeq != = undefined) {
						stats.removedLeafCount++;
					}
				}
				if (height > stats.maxHeight) {
					stats.maxHeight = height;
				}
			}
			stats.histo[block.childCount]++;
			stats.nodeCount++;
			stats.liveCount += block.childCount;
			return stats;
		}
		let rootStats = <MergeTreeStats>nodeGetStats(this.root);
		if (MergeTree.options.measureWindowTime) {
			rootStats.windowTime = this.windowTime;
			rootStats.packTime = this.packTime;
			rootStats.ordTime = this.ordTime;
			rootStats.maxOrdTime = this.maxOrdTime;
		}
		return rootStats;
	}

	tardisPosition(pos: number, fromSeq : number, toSeq : number, toClientId = NonCollabClient) {
		return this.tardisPositionFromClient(pos, fromSeq, toSeq, NonCollabClient, toClientId);
	}

	tardisPositionFromClient(pos: number, fromSeq : number, toSeq : number, fromClientId : number,
		toClientId = NonCollabClient) {
		if (((fromSeq < toSeq) || (toClientId == = this.collabWindow.clientId)) && pos < this.getLength(fromSeq, fromClientId)) {
			if ((toSeq <= this.collabWindow.currentSeq) && (fromSeq >= this.collabWindow.minSeq)) {
				let segoff = this.getContainingSegment(pos, fromSeq, fromClientId);
				let toPos = this.getOffset(segoff.segment, toSeq, toClientId);
				let ret = toPos + segoff.offset;
				assert(ret != = undefined);
				return ret;
			}
			assert(false);
		}
		else {
			return pos;
		}
	}

	tardisRangeFromClient(rangeStart: number, rangeEnd : number, fromSeq : number, toSeq : number, fromClientId : number,
		toClientId = NonCollabClient) {
		let ranges = <Base.IIntegerRange[]>[];
		let recordRange = (segment: Segment, pos : number, refSeq : number, clientId : number, segStart : number,
			segEnd : number) = > {
			if (this.nodeLength(segment, toSeq, toClientId) > 0) {
				let offset = this.getOffset(segment, toSeq, toClientId);
				if (segStart < 0) {
					segStart = 0;
				}
				if (segEnd > segment.cachedLength) {
					segEnd = segment.cachedLength;
				}
				ranges.push({ start: offset + segStart, end : offset + segEnd });
			}
			return true;
		}
		this.mapRange({ leaf: recordRange }, fromSeq, fromClientId, undefined, rangeStart, rangeEnd);
		return ranges;
	}

	tardisRange(rangeStart: number, rangeEnd : number, fromSeq : number, toSeq : number, toClientId = NonCollabClient) {
		return this.tardisRangeFromClient(rangeStart, rangeEnd, fromSeq, toSeq, NonCollabClient, toClientId);
	}

	getLength(refSeq: number, clientId : number) {
		return this.blockLength(this.root, refSeq, clientId);
	}

	getOffset(node: MergeNode, refSeq : number, clientId : number) {
		let totalOffset = 0;
		let parent = node.parent;
		let prevParent : IMergeBlock;
		while (parent) {
			let children = parent.children;
			for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
				let child = children[childIndex];
				if ((prevParent && (child == prevParent)) || (child == node)) {
					break;
				}
				totalOffset += this.nodeLength(child, refSeq, clientId);
			}
			prevParent = parent;
			parent = parent.parent;
		}
		return totalOffset;
	}

	searchFromPos(pos: number, target : RegExp) {
		let start = pos;
		let end = pos + MergeTree.searchChunkSize;
		let chunk = "";
		let found = false;
		while (!found) {
			if (end > this.root.cachedLength) {
				end = this.root.cachedLength;
			}
			chunk += this.getText(UniversalSequenceNumber, this.collabWindow.clientId, "", start, end);
			let result = chunk.match(target);
			if (result != = null) {
				return { text: result[0], pos : result.index };
			}
			start += MergeTree.searchChunkSize;
			if (start >= this.root.cachedLength) {
				break;
			}
			end += MergeTree.searchChunkSize;
		}
	}

	gatherSegment = (segment: Segment, pos : number, refSeq : number, clientId : number, start : number,
		end : number, accumSegments : SegmentAccumulator) = > {
		if (start < 0) {
			start = 0;
		}
		if (end > segment.cachedLength) {
			end = segment.cachedLength;
		}
		if (segment.getType() == = SegmentType.Text) {
			let textSegment = <TextSegment>segment;
			accumSegments.segments.push(textSegment.clone(start, end));
		}
		else {
			let marker = <Marker>segment;
			accumSegments.segments.push(marker.clone());
		}
		return true;
	}

	gatherText = (segment: Segment, pos : number, refSeq : number, clientId : number, start : number,
		end : number, accumText : TextAccumulator) = > {
		if (segment.getType() == SegmentType.Text) {
			let textSegment = <TextSegment>segment;
			if (MergeTree.traceGatherText) {
				console.log(`@cli ${ this.getLongClientId(this.collabWindow.clientId) } gather seg seq ${ textSegment.seq } rseq ${ textSegment.removedSeq } text ${ textSegment.text }`);
			}
			let beginTags = "";
			let endTags = "";
			if (accumText.parallelArrays) {
				// TODO: let clients pass in function to get tag
				let tags = <string[]>[];
				let initTags = <string[]>[];

				if (textSegment.properties && (textSegment.properties["font-weight"])) {
					tags.push("b");
				}
				if (textSegment.properties && (textSegment.properties["text-decoration"])) {
					tags.push("u");
				}
				let remTags = <string[]>[];
				if (tags.length > 0) {
					for (let tag of tags) {
						if (accumText.tagsInProgress.indexOf(tag) < 0) {
							beginTags += `<${ tag }>`;
								initTags.push(tag);
						}
					}
					for (let accumTag of accumText.tagsInProgress) {
						if (tags.indexOf(accumTag) < 0) {
							endTags += `< / ${ accumTag }>`;
								remTags.push(accumTag);
						}
					}
					for (let initTag of initTags.reverse()) {
						accumText.tagsInProgress.push(initTag);
					}
				}
				else {
					for (let accumTag of accumText.tagsInProgress) {
						endTags += `< / ${ accumTag }>`;
							remTags.push(accumTag);
					}
				}
				for (let remTag of remTags) {
					let remdex = accumText.tagsInProgress.indexOf(remTag);
					if (remdex >= 0) {
						accumText.tagsInProgress.splice(remdex, 1);
					}
				}
			}
			accumText.textSegment.text += endTags;
			accumText.textSegment.text += beginTags;
			if ((start <= 0) && (end >= textSegment.text.length)) {
				accumText.textSegment.text += textSegment.text;
			}
			else {
				if (start < 0) {
					start = 0;
				}
				if (end >= textSegment.text.length) {
					accumText.textSegment.text += textSegment.text.substring(start);
				}
				else {
					accumText.textSegment.text += textSegment.text.substring(start, end);
				}
			}
		}
		else {
			if (accumText.placeholder && (accumText.placeholder.length > 0)) {
				if (accumText.placeholder == = "*") {
					let marker = <Marker>segment;
					accumText.textSegment.text += `\n${ marker.toString() }`;
				}
				else {
					for (let i = 0; i < segment.cachedLength; i++) {
						accumText.textSegment.text += accumText.placeholder;
					}
				}
			}
			else if (accumText.parallelArrays) {
				let marker = <Marker>segment;
				if (marker.hasTileLabel(accumText.parallelMarkerLabel)) {
					accumText.parallelMarkers.push(marker);
					accumText.parallelText.push(accumText.textSegment.text);
					accumText.textSegment.text = "";
				}

			}
		}

		return true;
	}

	incrementalGetText(refSeq: number, clientId : number, start ? : number, end ? : number) {
		if (start == = undefined) {
			start = 0;
		}
		if (end == = undefined) {
			end = this.blockLength(this.root, refSeq, clientId);
		}
		let context = new TextSegment("");
		let stack = new Collections.Stack<IncrementalMapState<TextSegment>>();
		let initialState = new IncrementalMapState(this.root, { leaf: incrementalGatherText },
			0, refSeq, clientId, context, start, end, 0);
		stack.push(initialState);

		while (!stack.empty()) {
			this.incrementalBlockMap(stack);
		}
		return context.text;
	}

	getTextAndMarkers(refSeq: number, clientId : number, label : string, start ? : number, end ? : number) {
		if (start == = undefined) {
			start = 0;
		}
		if (end == = undefined) {
			end = this.blockLength(this.root, refSeq, clientId);
		}
		let accum = <TextAccumulator>{
		textSegment: new TextSegment(""), parallelMarkerLabel : label, parallelArrays : true, parallelMarkers : [], parallelText : [],
					 tagsInProgress : []
		};

		if (MergeTree.traceGatherText) {
			console.log(`get text on cli ${ glc(this, this.collabWindow.clientId) } ref cli ${ glc(this, clientId) } refSeq ${ refSeq }`);
		}
		this.mapRange<TextAccumulator>({ leaf: this.gatherText }, refSeq, clientId, accum, start, end);
		return { paralellText: accum.parallelText, parallelMarkers : accum.parallelMarkers };
	}

	cloneSegments(refSeq: number, clientId : number, start = 0, end ? : number) {
		if (end == = undefined) {
			end = this.blockLength(this.root, refSeq, clientId);
		}
		let accum = <SegmentAccumulator>{
		segments: <Segment[]>[]
		};
		this.mapRange<SegmentAccumulator>({ leaf: this.gatherSegment }, refSeq, clientId, accum, start, end);
		return accum.segments;
	}

	getText(refSeq: number, clientId : number, placeholder = "", start ? : number, end ? : number) {
		if (start == = undefined) {
			start = 0;
		}
		if (end == = undefined) {
			end = this.blockLength(this.root, refSeq, clientId);
		}
		let accum = <TextAccumulator>{ textSegment: new TextSegment(""), placeholder };

		if (MergeTree.traceGatherText) {
			console.log(`get text on cli ${ glc(this, this.collabWindow.clientId) } ref cli ${ glc(this, clientId) } refSeq ${ refSeq }`);
		}
		this.mapRange<TextAccumulator>({ leaf: this.gatherText }, refSeq, clientId, accum, start, end);
		return accum.textSegment.text;
	}

	getContainingSegment(pos: number, refSeq : number, clientId : number) {
		let segment : Segment;
		let offset : number;

		let leaf = (leafSeg: Segment, segpos : number, refSeq : number, clientId : number, start : number) = > {
			segment = leafSeg;
			offset = start;
			return false;
		};
		this.searchBlock(this.root, pos, 0, refSeq, clientId, { leaf });
		return { segment, offset };
	}

	blockLength(node: IMergeBlock, refSeq : number, clientId : number) {
		if ((this.collabWindow.collaborating) && (clientId != this.collabWindow.clientId)) {
			return node.partialLengths.getPartialLength(this, refSeq, clientId);
		}
		else {
			return node.cachedLength;
		}
	}

	getRemovalInfo(branchId: number, segBranchId : number, segment : Segment) {
		if (branchId > segBranchId) {
			let index = (branchId - segBranchId) - 1;
			if (!segment.removalsByBranch) {
				segment.removalsByBranch = <IRemovalInfo[]>[];
			}
			if (!segment.removalsByBranch[index]) {
				segment.removalsByBranch[index] = <IRemovalInfo>{};
			}
			return segment.removalsByBranch[index];
		}
		else {
			return <IRemovalInfo>segment;
		}
	}

	nodeLength(node: MergeNode, refSeq : number, clientId : number) {
		if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId == clientId)) {
			// local client sees all segments, even when collaborating
			if (!node.isLeaf()) {
				return node.cachedLength;
			}
			else {
				return this.localNetLength(<Segment>node);
			}
		}
		else {
			// sequence number within window 
			let branchId = this.getBranchId(clientId);
			if (!node.isLeaf()) {
				return (<IMergeBlock>node).partialLengths.getPartialLength(this, refSeq, clientId);
			}
			else {
				let segment = <Segment>node;
				let segBranchId = this.getBranchId(segment.clientId);
				if ((segBranchId <= branchId) && ((segment.clientId == = clientId) ||
					((segment.seq != UnassignedSequenceNumber) && (segment.seq <= refSeq)))) {
					let removalInfo = <IRemovalInfo>segment;
					if (branchId > segBranchId) {
						removalInfo = this.getRemovalInfo(branchId, segBranchId, segment);
					}
					// segment happened by reference sequence number or segment from requesting client
					if (removalInfo.removedSeq != = undefined) {
						if ((removalInfo.removedClientId == = clientId) ||
							(removalInfo.removedClientOverlap && (removalInfo.removedClientOverlap.indexOf(clientId) >= 0)) ||
							((removalInfo.removedSeq != UnassignedSequenceNumber) && (removalInfo.removedSeq <= refSeq))) {
							return 0;
						}
						else {
							return segment.cachedLength;
						}
					}
					else {
						return segment.cachedLength;
					}
				}
				else {
					// segment invisible to client at reference sequence number/branch id/client id of op
					return 0;
				}
			}
		}
	}

	updateLocalMinSeq(localMinSeq: number) {
		this.collabWindow.localMinSeq = localMinSeq;
		this.setMinSeq(Math.min(this.collabWindow.globalMinSeq, localMinSeq));
	}

	addMinSeqListener(minRequired: number, onMinGE : (minSeq : number) = > void) {
		if (!this.minSeqListeners) {
			this.minSeqListeners = new Collections.Heap<MinListener>([],
				minListenerComparer);
		}
		this.minSeqListeners.add({ minRequired, onMinGE });
	}

	notifyMinSeqListeners() {
		this.minSeqPending = false;
		while ((this.minSeqListeners.count() > 0) &&
			(this.minSeqListeners.peek().minRequired <= this.collabWindow.minSeq)) {
			let minListener = this.minSeqListeners.get();
			minListener.onMinGE(this.collabWindow.minSeq);
		}
	}

	setMinSeq(minSeq: number) {
		if (minSeq > this.collabWindow.minSeq) {
			this.collabWindow.minSeq = minSeq;
			if (MergeTree.options.zamboniSegments) {
				this.zamboniSegments();
			}
			if (this.minSeqListeners && this.minSeqListeners.count()) {
				this.minSeqPending = true;
			}
		}
	}

	commitGlobalMin() {
		if (this.collabWindow.globalMinSeq != = undefined) {
			this.collabWindow.localMinSeq = this.collabWindow.globalMinSeq;
			this.setMinSeq(this.collabWindow.globalMinSeq);
		}
	}

	updateGlobalMinSeq(globalMinSeq: number) {
		if (this.collabWindow.localMinSeq == = undefined) {
			this.setMinSeq(globalMinSeq);
		}
		else {
			this.collabWindow.globalMinSeq = globalMinSeq;
			this.setMinSeq(Math.min(globalMinSeq, this.collabWindow.localMinSeq));
		}
	}

	referencePositionToLocalPosition(refPos: ReferencePosition,
		refSeq = UniversalSequenceNumber, clientId = this.collabWindow.clientId) {
		let seg = refPos.getSegment();
		let offset = refPos.getOffset();
		return offset + this.getOffset(seg, refSeq, clientId);
	}

	getStackContext(startPos: number, clientId : number, rangeLabels : string[]) {
		let searchInfo = <IMarkerSearchRangeInfo>{
		mergeTree: this,
				   stacks : Properties.createMap<Collections.Stack<Marker>>(),
							rangeLabels
		};

		this.search(startPos, UniversalSequenceNumber, clientId,
			{ leaf: recordRangeLeaf, shift : rangeShift }, searchInfo);
		return searchInfo.stacks;
	}

	// TODO: with annotation op change value
	cherryPickedUndo(undoInfo: IUndoInfo) {
		let segment = undoInfo.seg;
		// no branches 
		if (segment.removedSeq != = undefined) {
			segment.removedSeq = undefined;
			segment.removedClientId = undefined;
		}
		else {
			if (undoInfo.op == = ops.MergeTreeDeltaType.REMOVE) {
				segment.removedSeq = undoInfo.seq;
			}
			else {
				segment.removedSeq = UnassignedSequenceNumber;
			}
			segment.removedClientId = this.collabWindow.clientId;
		}
		this.blockUpdatePathLengths(segment.parent, UnassignedSequenceNumber, -1, true);
	}

	// TODO: filter function
	findTile(startPos: number, clientId : number, tileLabel : string, preceding = true) {
		let searchInfo = <IReferenceSearchInfo>{
		mergeTree: this,
				   preceding,
				   tileLabel,
		};

		if (preceding) {
			this.search(startPos, UniversalSequenceNumber, clientId,
				{ leaf: recordTileStart, shift : tileShift }, searchInfo);
		}
		else {
			this.backwardSearch(startPos, UniversalSequenceNumber, clientId,
				{ leaf: recordTileStart, shift : tileShift }, searchInfo);
		}

		if (searchInfo.tile) {
			let pos : number;
			if (searchInfo.tile.isLeaf()) {
				let marker = <Marker>searchInfo.tile;
				pos = this.getOffset(marker, UniversalSequenceNumber, clientId);
			}
			else {
				let localRef = <LocalReference>searchInfo.tile;
				pos = localRef.toPosition(this, UniversalSequenceNumber, clientId);
			}
			return { tile: searchInfo.tile, pos };
		}
	}

	search<TClientData>(pos: number, refSeq : number, clientId : number,
		actions ? : SegmentActions<TClientData>, clientData ? : TClientData) : Segment{
			return this.searchBlock(this.root, pos, 0, refSeq, clientId, actions, clientData);
	}

		searchBlock<TClientData>(block : IMergeBlock, pos : number, segpos : number, refSeq : number, clientId : number,
			actions ? : SegmentActions<TClientData>, clientData ? : TClientData) : Segment{
				let children = block.children;
	if (actions && actions.pre) {
		actions.pre(block, segpos, refSeq, clientId, undefined, undefined, clientData);
	}
	let contains = actions && actions.contains;
	for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
		let child = children[childIndex];
		let len = this.nodeLength(child, refSeq, clientId);
		if (((!contains) && (pos < len)) || (contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
			// found entry containing pos
			if (!child.isLeaf()) {
				return this.searchBlock(<IMergeBlock>child, pos, segpos, refSeq, clientId, actions, clientData);
			}
			else {
				if (actions && actions.leaf) {
					actions.leaf(<Segment>child, segpos, refSeq, clientId, pos, -1, clientData);
				}
				return <Segment>child;
			}
		}
		else {
			if (actions && actions.shift) {
				actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
			}
			pos -= len;
			segpos += len;
		}
	}
	if (actions && actions.post) {
		actions.post(block, segpos, refSeq, clientId, undefined, undefined, clientData);
	}
	}

		backwardSearch<TClientData>(pos: number, refSeq : number, clientId : number,
			actions ? : SegmentActions<TClientData>, clientData ? : TClientData) : Segment{
				return this.backwardSearchBlock(this.root, pos, this.getLength(refSeq, clientId), refSeq, clientId, actions, clientData);
	}

		backwardSearchBlock<TClientData>(block : IMergeBlock, pos : number, segEnd : number, refSeq : number, clientId : number,
			actions ? : SegmentActions<TClientData>, clientData ? : TClientData) : Segment{
				let children = block.children;
	if (actions && actions.pre) {
		actions.pre(block, segEnd, refSeq, clientId, undefined, undefined, clientData);
	}
	let contains = actions && actions.contains;
	for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
		let child = children[childIndex];
		let len = this.nodeLength(child, refSeq, clientId);
		let segpos = segEnd - len;
		if (((!contains) && (pos >= segpos)) ||
			(contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
			// found entry containing pos
			if (!child.isLeaf()) {
				return this.backwardSearchBlock(<IMergeBlock>child, pos, segEnd, refSeq, clientId, actions, clientData);
			}
			else {
				if (actions && actions.leaf) {
					actions.leaf(<Segment>child, segpos, refSeq, clientId, pos, -1, clientData);
				}
				return <Segment>child;
			}
		}
		else {
			if (actions && actions.shift) {
				actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
			}
			segEnd = segpos;
		}
	}
	if (actions && actions.post) {
		actions.post(block, segEnd, refSeq, clientId, undefined, undefined, clientData);
	}
	}

		updateRoot(splitNode: IMergeBlock, refSeq : number, clientId : number, seq : number) {
		if (splitNode != = undefined) {
			let newRoot = this.makeBlock(2);
			newRoot.index = 0;
			newRoot.ordinal = "";
			newRoot.assignChild(this.root, 0, false);
			newRoot.assignChild(splitNode, 1, false);
			this.root = newRoot;
			this.nodeUpdateOrdinals(this.root);
			this.nodeUpdateLengthNewStructure(this.root);
		}
	}

	/**
	* Assign sequence number to existing segment; update partial lengths to reflect the change
	* @param seq sequence number given by server to pending segment
	*/
	ackPendingSegment(seq: number, verboseOps = false) {
		let pendingSegmentGroup = this.pendingSegments.dequeue();
		let nodesToUpdate = <IMergeBlock[]>[];
		let clientId : number;
		let overwrite = false;
		if (pendingSegmentGroup != = undefined) {
			if (verboseOps) {
				console.log(`segment group has ${ pendingSegmentGroup.segments.length } segments`);
			}
			pendingSegmentGroup.segments.map((pendingSegment) = > {
				if (pendingSegment.seq == = UnassignedSequenceNumber) {
					pendingSegment.seq = seq;
				}
				else {
					let segBranchId = this.getBranchId(pendingSegment.clientId);
					let removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, pendingSegment);
					if (removalInfo.removedSeq != = undefined) {
						if (removalInfo.removedSeq != UnassignedSequenceNumber) {
							overwrite = true;
							if (MergeTree.diagOverlappingRemove) {
								console.log(`grump @seq ${ seq } cli ${ glc(this, this.collabWindow.clientId) } from ${ pendingSegment.removedSeq } text ${ pendingSegment.toString() }`);
							}
						}
						else {
							removalInfo.removedSeq = seq;
						}
					}
				}
				pendingSegment.segmentGroup = undefined;
				clientId = this.collabWindow.clientId;
				if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
					nodesToUpdate.push(pendingSegment.parent);
				}
			});
								for (let node of nodesToUpdate) {
									this.blockUpdatePathLengths(node, seq, clientId, overwrite);
									//nodeUpdatePathLengths(node, seq, clientId, true);
								}
		}
	}

	addToPendingList(segment: Segment, segmentGroup ? : SegmentGroup) {
		if (segmentGroup == = undefined) {
			if (this.transactionSegmentGroup) {
				segmentGroup = this.transactionSegmentGroup;
			}
			else {
				segmentGroup = <SegmentGroup>{ segments: [] };
				this.pendingSegments.enqueue(segmentGroup);
			}
		}
		// TODO: share this group with UNDO
		segment.segmentGroup = segmentGroup;
		addToSegmentGroup(segment);
		return segmentGroup;
	}

	// assumes not collaborating for now
	appendSegment(segSpec: ops.IPropertyString, seq = UniversalSequenceNumber) {
		let pos = this.root.cachedLength;
		if (segSpec.text) {
			this.insertText(pos, UniversalSequenceNumber, LocalClientId, seq, segSpec.text,
				segSpec.props as Properties.PropertySet);
		}
		else {
			// assume marker for now
			this.insertMarker(pos, UniversalSequenceNumber, LocalClientId,
				seq, segSpec.marker.refType, segSpec.props as Properties.PropertySet);
		}
	}

	// TODO: error checking
	getSegmentFromId(id: string) {
		return this.idToSegment[id];
	}

	getSegmentFromLocalId(id: string) {
		return this.localIdToSegment[id];
	}

	/**
	* Given a position specified relative to a marker id, lookup the marker
	* and convert the position to a character position.
	* @param relativePos Id of marker (may be indirect) and whether position is before or after marker.
	* @param refseq The reference sequence number at which to compute the position.
	* @param clientId The client id with which to compute the position.
	*/
	posFromRelativePos(relativePos: IRelativePosition, refseq = UniversalSequenceNumber,
		clientId = this.collabWindow.clientId) {
		let pos = -1;
		let marker : Marker;
		if (relativePos.id) {
			marker = <Marker>this.getSegmentFromId(relativePos.id);
		}
		if (marker) {
			pos = this.getOffset(marker, refseq, clientId);
			if (!relativePos.before) {
				pos += marker.cachedLength;
				if (relativePos.offset != = undefined) {
					pos += relativePos.offset;
				}
			}
			else {
				if (relativePos.offset != = undefined) {
					pos -= relativePos.offset;
				}
			}

		}
		return pos;
	}

	insert<T>(pos: number, refSeq : number, clientId : number, seq : number, segData : T,
		traverse : (block : IMergeBlock, pos : number, refSeq : number, clientId : number, seq : number, segData : T) = > IMergeBlock) {
		this.ensureIntervalBoundary(pos, refSeq, clientId);
		if (MergeTree.traceOrdinals) {
			this.ordinalIntegrity();
		}
		//traceTraversal = true;
		let splitNode = traverse(this.root, pos, refSeq, clientId, seq, segData);
		//traceTraversal = false;
		this.updateRoot(splitNode, refSeq, clientId, seq);
	}

	insertMarker(pos: number, refSeq : number, clientId : number, seq : number,
		behaviors : ops.ReferenceType, props ? : Properties.PropertySet) {
		let marker = Marker.make(behaviors, props, seq, clientId);

		let markerId = marker.getId();
		if (markerId) {
			this.mapIdToSegment(markerId, marker);
		}
		this.insert(pos, refSeq, clientId, seq, marker, (block, pos, refSeq, clientId, seq, marker) = >
			this.blockInsert(block, pos, refSeq, clientId, seq, marker));
		// report segment if client interested
		if (this.markerModifiedHandler && (seq != = UnassignedSequenceNumber)) {
			this.markerModifiedHandler(marker);
		}
		return marker;
	}

	insertTextMarkerRelative(markerPos: IRelativePosition, refSeq : number, clientId : number, seq : number,
		text : string, props ? : Properties.PropertySet) {
		let pos = this.posFromRelativePos(markerPos, refSeq, clientId);
		if (pos >= 0) {
			let newSegment = TextSegment.make(text, props, seq, clientId);
			// MergeTree.traceTraversal = true;
			this.insert(pos, refSeq, clientId, seq, text, (block, pos, refSeq, clientId, seq, text) = >
				this.blockInsert(this.root, pos, refSeq, clientId, seq, newSegment));
			MergeTree.traceTraversal = false;
			if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
				(seq != UnassignedSequenceNumber)) {
				this.zamboniSegments();
			}
		}
	}

	insertText(pos: number, refSeq : number, clientId : number, seq : number, text : string, props ? : Properties.PropertySet) {
		let newSegment = TextSegment.make(text, props, seq, clientId);
		// MergeTree.traceTraversal = true;
		this.insert(pos, refSeq, clientId, seq, text, (block, pos, refSeq, clientId, seq, text) = >
			this.blockInsert(this.root, pos, refSeq, clientId, seq, newSegment));
		MergeTree.traceTraversal = false;
		if (MergeTree.traceOrdinals) {
			this.ordinalIntegrity();
		}
		if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
			(seq != UnassignedSequenceNumber)) {
			this.zamboniSegments();
		}
	}

	blockInsert<T extends Segment>(block: IMergeBlock, pos : number, refSeq : number, clientId : number, seq : number, newSegment : T) {
		let segIsLocal = false;
		let checkSegmentIsLocal = (segment: Segment, pos : number, refSeq : number, clientId : number) = > {
			if (segment.seq == UnassignedSequenceNumber) {
				if (MergeTree.diagInsertTie) {
					console.log(`@cli ${ glc(this, this.collabWindow.clientId) }: promoting continue due to seq ${ segment.seq } text ${ segment.toString() } ref ${ refSeq }`);
				}
				segIsLocal = true;
			}
			// only need to look at first segment that follows finished node
			return false;
		}

		let continueFrom = (node: IMergeBlock) = > {
			segIsLocal = false;
			this.rightExcursion(node, checkSegmentIsLocal);
			if (MergeTree.diagInsertTie && segIsLocal && (newSegment.getType() == = SegmentType.Text)) {
				let text = newSegment.toString();
				console.log(`@cli ${ glc(this, this.collabWindow.clientId) }: attempting continue with seq ${ seq } text ${ text } ref ${ refSeq }`);
			}
			return segIsLocal;
		}

		let onLeaf = (segment: Segment, pos : number) = > {
			let saveIfLocal = (locSegment: Segment) = > {
				// save segment so can assign sequence number when acked by server
				if (this.collabWindow.collaborating) {
					if ((locSegment.seq == UnassignedSequenceNumber) &&
						(clientId == this.collabWindow.clientId)) {
						this.addToPendingList(locSegment);
					}
					else if ((locSegment.seq >= this.collabWindow.minSeq) &&
						MergeTree.options.zamboniSegments) {
						this.addToLRUSet(locSegment, locSegment.seq);
					}
				}
			}
			let segmentChanges = <SegmentChanges>{};
			if (segment) {
				// insert before segment
				segmentChanges.replaceCurrent = newSegment;
				segmentChanges.next = segment;
			}
			else {
				segmentChanges.next = newSegment;
			}
			saveIfLocal(newSegment);
			return segmentChanges;
		}
		return this.insertingWalk(block, pos, refSeq, clientId, seq, newSegment.getType(),
			{ leaf: onLeaf, continuePredicate : continueFrom });
	}

	splitLeafSegment = (segment: Segment, pos : number) = > {
		let segmentChanges = <SegmentChanges>{};
		if (pos > 0) {
			segmentChanges.next = segment.splitAt(pos);
		}
		return segmentChanges;
	}

	ensureIntervalBoundary(pos: number, refSeq : number, clientId : number) {
		let splitNode = this.insertingWalk(this.root, pos, refSeq, clientId, TreeMaintainanceSequenceNumber,
			SegmentType.Base, { leaf: this.splitLeafSegment });
		this.updateRoot(splitNode, refSeq, clientId, TreeMaintainanceSequenceNumber);
	}

	// assume called only when pos == len
	breakTie(pos: number, len : number, seq : number, node : MergeNode, refSeq : number, clientId : number, segType : SegmentType) {
		if (node.isLeaf()) {
			let segment = <Segment>node;
			// TODO: marker/marker tie break & collab markers
			if (pos == 0) {
				return segment.seq != = UnassignedSequenceNumber;
			}
			else {
				return false;
			}
		}
		else {
			return true;
		}
	}

	// visit segments starting from node's right siblings, then up to node's parent
	leftExcursion<TClientData>(node: MergeNode, leafAction : SegmentAction<TClientData>) {
		let actions = { leaf: leafAction };
		let go = true;
		let startNode = node;
		let parent = startNode.parent;
		while (parent) {
			let children = parent.children;
			let childIndex : number;
			let node : MergeNode;
			let matchedStart = false;
			for (childIndex = parent.childCount - 1; childIndex >= 0; childIndex--) {
				node = children[childIndex];
				if (matchedStart) {
					if (!node.isLeaf()) {
						let childBlock = <IMergeBlock>node;
						go = this.nodeMapReverse(childBlock, actions, 0, UniversalSequenceNumber,
							this.collabWindow.clientId, undefined);
					}
					else {
						go = leafAction(<Segment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
					}
					if (!go) {
						return;
					}
				}
				else {
					matchedStart = (startNode == = node);
				}
			}
			startNode = parent;
			parent = parent.parent;
		}
	}

	// visit segments starting from node's right siblings, then up to node's parent
	rightExcursion<TClientData>(node: MergeNode, leafAction : SegmentAction<TClientData>) {
		let actions = { leaf: leafAction };
		let go = true;
		let startNode = node;
		let parent = startNode.parent;
		while (parent) {
			let children = parent.children;
			let childIndex : number;
			let node : MergeNode;
			let matchedStart = false;
			for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
				node = children[childIndex];
				if (matchedStart) {
					if (!node.isLeaf()) {
						let childBlock = <IMergeBlock>node;
						go = this.nodeMap(childBlock, actions, 0, UniversalSequenceNumber, this.collabWindow.clientId,
							undefined);
					}
					else {
						go = leafAction(<Segment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
					}
					if (!go) {
						return;
					}
				}
				else {
					matchedStart = (startNode == = node);
				}
			}
			startNode = parent;
			parent = parent.parent;
		}
	}

	private insertingWalk(block: IMergeBlock, pos : number, refSeq : number, clientId : number, seq : number,
		segType : SegmentType, context : InsertContext) {
		let children = block.children;
		let childIndex : number;
		let child : MergeNode;
		let newNode : MergeNode;
		let fromSplit : IMergeBlock;
		let found = false;
		for (childIndex = 0; childIndex < block.childCount; childIndex++) {
			child = children[childIndex];
			let len = this.nodeLength(child, refSeq, clientId);
			if (MergeTree.traceTraversal) {
				let segInfo : string;
				if ((!child.isLeaf()) && this.collabWindow.collaborating) {
					segInfo = `minLength: ${ (<IMergeBlock>child).partialLengths.minLength }`;
				}
				else {
					let segment = <Segment>child;
					segInfo = `cli: ${ glc(this, segment.clientId) } seq: ${ segment.seq } text: ${ segment.toString() }`;
						if (segment.removedSeq != = undefined) {
							segInfo += ` rcli: ${ glc(this, segment.removedClientId) } rseq: ${ segment.removedSeq }`;
						}
				}
				console.log(`@tcli: ${ glc(this, this.collabWindow.clientId) } len: ${ len } pos: ${ pos } ` + segInfo);
			}

			if ((pos < len) || ((pos == len) && this.breakTie(pos, len, seq, child, refSeq, clientId, segType))) {
				// found entry containing pos
				found = true;
				if (!child.isLeaf()) {
					let childBlock = <IMergeBlock>child;
					//internal node
					let splitNode = this.insertingWalk(childBlock, pos, refSeq, clientId,
						seq, segType, context);
					if (splitNode == = undefined) {
						this.blockUpdateLength(block, seq, clientId);
						return undefined;
					}
					else if (splitNode == MergeTree.theUnfinishedNode) {
						if (MergeTree.traceTraversal) {
							console.log(`@cli ${ glc(this, this.collabWindow.clientId) } unfinished bus pos ${ pos } len ${ len }`);
						}
						pos -= len; // act as if shifted segment
						continue;
					}
					else {
						newNode = splitNode;
						fromSplit = splitNode;
						childIndex++; // insert after
					}
				}
				else {
					if (MergeTree.traceTraversal) {
						console.log(`@tcli: ${ glc(this, this.collabWindow.clientId) }: leaf action`);
					}

					let segmentChanges = context.leaf(<Segment>child, pos);
					if (segmentChanges.replaceCurrent) {
						if (MergeTree.traceOrdinals) {
							console.log(`assign from leaf with block ord ${ ordinalToArray(block.ordinal) }`);
						}
						block.assignChild(segmentChanges.replaceCurrent, childIndex, false);
						segmentChanges.replaceCurrent.ordinal = child.ordinal;
					}
					if (segmentChanges.next) {
						newNode = segmentChanges.next;
						childIndex++; // insert after
					}
					else {
						// no change
						return undefined;
					}
				}
				break;
			}
			else {
				pos -= len;
			}
		}
		if (MergeTree.traceTraversal) {
			if ((!found) && (pos > 0)) {
				console.log(`inserting walk fell through pos ${ pos } len: ${ this.blockLength(this.root, refSeq, clientId) }`);
			}
		}
		if (!newNode) {
			if (pos == 0) {
				if ((seq != UnassignedSequenceNumber) && context.continuePredicate &&
					context.continuePredicate(block)) {
					return MergeTree.theUnfinishedNode;
				}
				else {
					if (MergeTree.traceTraversal) {
						console.log(`@tcli: ${ glc(this, this.collabWindow.clientId) }: leaf action pos 0`);
					}
					let segmentChanges = context.leaf(undefined, pos);
					newNode = segmentChanges.next;
					// assert segmentChanges.replaceCurrent === undefined
				}
			}
		}
		if (newNode) {
			for (let i = block.childCount; i > childIndex; i--) {
				block.children[i] = block.children[i - 1];
				block.children[i].index = i;
			}
			block.assignChild(newNode, childIndex, false);
			block.childCount++;
			block.setOrdinal(newNode, childIndex);
			if (block.childCount < MaxNodesInBlock) {
				if (fromSplit) {
					if (MergeTree.traceOrdinals) {
						console.log(`split ord ${ ordinalToArray(fromSplit.ordinal) }`);
					}
					this.nodeUpdateOrdinals(fromSplit);
				}
				this.blockUpdateLength(block, seq, clientId);
				return undefined;
			}
			else {
				// don't update ordinals because higher block will do it
				return this.split(block);
			}
		}
		else {
			return undefined;
		}
	}

	private split(node: IMergeBlock) {
		let halfCount = MaxNodesInBlock / 2;
		let newNode = this.makeBlock(halfCount);
		node.childCount = halfCount;
		// update ordinals to reflect lowered child count
		this.nodeUpdateOrdinals(node);
		for (let i = 0; i < halfCount; i++) {
			newNode.assignChild(node.children[halfCount + i], i, false);
			node.children[halfCount + i] = undefined;
		}
		this.nodeUpdateLengthNewStructure(node);
		this.nodeUpdateLengthNewStructure(newNode);
		return newNode;
	}

	ordinalIntegrity() {
		console.log("chk ordnls");
		this.nodeOrdinalIntegrity(this.root);
	}

	nodeOrdinalIntegrity(block: IMergeBlock) {
		let olen = block.ordinal.length;
		for (let i = 0; i < block.childCount; i++) {
			if (block.children[i].ordinal) {
				if (olen != = (block.children[i].ordinal.length - 1)) {
					console.log("node integrity issue");

				}
				if (i > 0) {
					if (block.children[i].ordinal <= block.children[i - 1].ordinal) {
						console.log("node sib integrity issue");
						console.log(`? ? : prnt chld prev ${ ordinalToArray(block.ordinal) } ${ ordinalToArray(block.children[i].ordinal) } ${ (i > 0) ? ordinalToArray(block.children[i - 1].ordinal) : "NA" }`);
					}
				}
				if (!block.children[i].isLeaf()) {
					this.nodeOrdinalIntegrity(<IMergeBlock>block.children[i]);
				}
			}
			else {
				console.log(`node child ordinal not set ${ i }`);
				console.log(`? ? : prnt ${ ordinalToArray(block.ordinal) }`);

			}
		}
	}

	nodeUpdateOrdinals(block: IMergeBlock) {
		if (MergeTree.traceOrdinals) {
			console.log(`update ordinals for children of node with ordinal ${ ordinalToArray(block.ordinal) }`);
		}
		let clockStart;
		if (MergeTree.options.measureOrdinalTime) {
			clockStart = clock();
		}
		for (let i = 0; i < block.childCount; i++) {
			let child = block.children[i];
			block.setOrdinal(child, i);
			if (!child.isLeaf()) {
				this.nodeUpdateOrdinals(<IMergeBlock>child);
			}
		}
		if (MergeTree.options.measureOrdinalTime) {
			let elapsed = elapsedMicroseconds(clockStart);
			if (elapsed > this.maxOrdTime) {
				this.maxOrdTime = elapsed;
			}
			this.ordTime += elapsed;
		}
	}

	addOverlappingClient(removalInfo: IRemovalInfo, clientId : number) {
		if (!removalInfo.removedClientOverlap) {
			removalInfo.removedClientOverlap = <number[]>[];
		}
		if (MergeTree.diagOverlappingRemove) {
			console.log(`added cli ${ glc(this, clientId) } to rseq : ${ removalInfo.removedSeq }`);
		}
		removalInfo.removedClientOverlap.push(clientId);
	}

	annotateRange(props: Properties.PropertySet, start : number, end : number, refSeq : number,
		clientId : number, seq : number, combiningOp ? : ops.ICombiningOp) {
		this.ensureIntervalBoundary(start, refSeq, clientId);
		this.ensureIntervalBoundary(end, refSeq, clientId);
		let annotateSegment = (segment: Segment) = > {
			let segType = segment.getType();
			if ((segType == SegmentType.Marker) || (segType == SegmentType.Text)) {
				let baseSeg = <BaseSegment>segment;
				baseSeg.addProperties(props, combiningOp, seq);
				if (this.markerModifiedHandler && (segType == = SegmentType.Marker) && (seq != = UnassignedSequenceNumber)) {
					this.markerModifiedHandler(<Marker>segment);
				}
			}
			return true;
		}
		this.mapRange({ leaf: annotateSegment }, refSeq, clientId, undefined, start, end);
	}

	markRangeRemoved(start: number, end : number, refSeq : number, clientId : number, seq : number, overwrite = false) {
		this.ensureIntervalBoundary(start, refSeq, clientId);
		this.ensureIntervalBoundary(end, refSeq, clientId);
		let segmentGroup : SegmentGroup;
		let savedLocalRefs = <LocalReference[][]>[];
		let markRemoved = (segment: Segment, pos : number, start : number, end : number) = > {
			let branchId = this.getBranchId(clientId);
			let segBranchId = this.getBranchId(segment.clientId);
			for (let brid = branchId; brid <= this.localBranchId; brid++) {
				let removalInfo = this.getRemovalInfo(brid, segBranchId, segment);
				if (removalInfo.removedSeq != undefined) {
					if (MergeTree.diagOverlappingRemove) {
						console.log(`yump @seq ${ seq } cli ${ glc(this, this.collabWindow.clientId) }: overlaps deleted segment ${ removalInfo.removedSeq } text '${segment.toString()}'`);
					}
					overwrite = true;
					if (removalInfo.removedSeq == = UnassignedSequenceNumber) {
						// will only happen on local branch (brid === this.localBranchId)
						// replace because comes later
						removalInfo.removedClientId = clientId;
						removalInfo.removedSeq = seq;
						if (segment.segmentGroup) {
							removeFromSegmentGroup(segment.segmentGroup, segment);
						}
						else {
							console.log(`missing segment group for seq ${ seq } ref seq ${ refSeq }`);
						}
					}
					else {
						// do not replace earlier sequence number for remove
						this.addOverlappingClient(removalInfo, clientId);
					}
				}
				else {
					removalInfo.removedClientId = clientId;
					removalInfo.removedSeq = seq;
					if (segment.localRefs && (brid == = this.localBranchId)) {
						savedLocalRefs.push(segment.localRefs);
						segment.localRefs = undefined;
					}
				}
			}
			// save segment so can assign removed sequence number when acked by server
			if (this.collabWindow.collaborating) {
				// report segment if client interested
				if (this.markerModifiedHandler && (segment.getType() == = SegmentType.Marker) && (seq != = UnassignedSequenceNumber)) {
					this.markerModifiedHandler(<Marker>segment);
				}
				// use removal information 
				let removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, segment);
				if ((removalInfo.removedSeq == = UnassignedSequenceNumber) && (clientId == = this.collabWindow.clientId)) {
					segmentGroup = this.addToPendingList(segment, segmentGroup);
				}
				else {
					if (MergeTree.options.zamboniSegments) {
						this.addToLRUSet(segment, seq);
					}
				}
				//console.log(`saved local removed seg with text: ${textSegment.text}`);
			}
			return true;
		}
		let afterMarkRemoved = (node: IMergeBlock, pos : number, start : number, end : number) = > {
			if (overwrite) {
				this.nodeUpdateLengthNewStructure(node);
			}
			else {
				this.blockUpdateLength(node, seq, clientId);
			}
			return true;
		}
		// MergeTree.traceTraversal = true;
		this.mapRange({ leaf: markRemoved, post : afterMarkRemoved }, refSeq, clientId, undefined, start, end);
		if (savedLocalRefs.length > 0) {
			let afterSeg : BaseSegment;
			for (let segSavedRefs of savedLocalRefs) {
				for (let localRef of segSavedRefs) {
					if (localRef.refType && (localRef.refType & ops.ReferenceType.SlideOnRemove)) {
						if (!afterSeg) {
							let afterSegOff = this.getContainingSegment(start, refSeq, clientId);
							afterSeg = <BaseSegment>afterSegOff.segment;
						}
						if (afterSeg) {
							localRef.segment = afterSeg;
							localRef.offset = 0;
							afterSeg.addLocalRef(localRef);
						}
					}
				}
			}
			if (afterSeg) {
				this.blockUpdatePathLengths(afterSeg.parent, TreeMaintainanceSequenceNumber,
					LocalClientId);
			}
		}
		if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber)) {
			if (MergeTree.options.zamboniSegments) {
				this.zamboniSegments();
			}
		}
		// MergeTree.traceTraversal = false;
	}

	removeRange(start: number, end : number, refSeq : number, clientId : number) {
		let removeInfo = <RemoveRangeInfo>{};
		this.nodeRemoveRange(this.root, start, end, refSeq, clientId, removeInfo);
		if (removeInfo.highestBlockRemovingChildren) {
			let remBlock = removeInfo.highestBlockRemovingChildren;
			this.nodeUpdateOrdinals(remBlock);
		}
	}

	nodeRemoveRange(block: IMergeBlock, start : number, end : number, refSeq : number, clientId : number, removeInfo : RemoveRangeInfo) {
		let children = block.children;
		let startIndex : number;
		if (start < 0) {
			startIndex = -1;
		}
		let endIndex = block.childCount;
		for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
			let child = children[childIndex];
			let len = this.nodeLength(child, refSeq, clientId);
			if ((start >= 0) && (start < len)) {
				startIndex = childIndex;
				if (!child.isLeaf()) {
					this.nodeRemoveRange(<IMergeBlock>child, start, end, refSeq, clientId, removeInfo);
				}
				else {
					let segment = <Segment>child;
					if (segment.removeRange(start, end)) {
						startIndex--;
					}
				}
			}
			// REVIEW: run this clause even if above clause runs
			if (end < len) {
				endIndex = childIndex;
				if (end > 0) {
					if (endIndex > startIndex) {
						if (!child.isLeaf()) {
							this.nodeRemoveRange(<IMergeBlock>child, start, end, refSeq, clientId, removeInfo);
						}
						else {
							let segment = <Segment>child;
							if (segment.removeRange(0, end)) {
								endIndex++;
							}
						}
					}
				}
				break;
			}
			start -= len;
			end -= len;
		}
		let deleteCount = (endIndex - startIndex) - 1;
		let deleteStart = startIndex + 1;
		if (deleteCount > 0) {
			// delete nodes in middle of range
			let copyStart = deleteStart + deleteCount;
			let copyCount = block.childCount - copyStart;
			for (let j = 0; j < copyCount; j++) {
				block.assignChild(children[copyStart + j], deleteStart + j, false);
			}
			block.childCount -= deleteCount;
			if (removeInfo.highestBlockRemovingChildren && removeInfo.highestBlockRemovingChildren.parent &&
				(removeInfo.highestBlockRemovingChildren.parent == = block.parent)) {
				removeInfo.highestBlockRemovingChildren = block.parent;
			}
			else {
				removeInfo.highestBlockRemovingChildren = block;
			}
		}
		this.nodeUpdateLengthNewStructure(block);
	}

	nodeUpdateLengthNewStructure(node: IMergeBlock, recur = false) {
		this.blockUpdate(node);
		if (this.collabWindow.collaborating) {
			node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow, recur);
		}
	}

	removeLocalReference(segment: BaseSegment, lref : LocalReference) {
		let removedRef = segment.removeLocalRef(lref);
		if (removedRef) {
			this.blockUpdatePathLengths(segment.parent, TreeMaintainanceSequenceNumber,
				LocalClientId);
		}
	}

	addLocalReference(lref: LocalReference) {
		let segment = lref.segment;
		segment.addLocalRef(lref);
		this.blockUpdatePathLengths(segment.parent, TreeMaintainanceSequenceNumber,
			LocalClientId);
	}

	blockUpdate(block: IMergeBlock) {
		let len = 0;
		let hierBlock : IHierBlock;
		if (this.blockUpdateMarkers) {
			hierBlock = block.hierBlock();
			hierBlock.rightmostTiles = Properties.createMap<Marker>();
			hierBlock.leftmostTiles = Properties.createMap<Marker>();
			hierBlock.rangeStacks = {};
		}
		for (let i = 0; i < block.childCount; i++) {
			let child = block.children[i];
			len += nodeTotalLength(this, child);
			if (this.blockUpdateMarkers) {
				hierBlock.addNodeReferences(this, child);
			}
			if (this.blockUpdateActions) {
				this.blockUpdateActions.child(block, i);
			}
		}
		block.cachedLength = len;
	}

	blockUpdatePathLengths(block: IMergeBlock, seq : number, clientId : number, newStructure = false) {
		while (block != = undefined) {
			if (newStructure) {
				this.nodeUpdateLengthNewStructure(block);
			}
			else {
				this.blockUpdateLength(block, seq, clientId);
			}
			block = block.parent;
		}
	}

	nodeCompareUpdateLength(node: IMergeBlock, seq : number, clientId : number) {
		this.blockUpdate(node);
		if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
			if (node.partialLengths != = undefined) {
				let bplStr = node.partialLengths.toString();
				node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
				let tempPartialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
				if (!tempPartialLengths.compare(node.partialLengths)) {
					console.log(`partial sum update mismatch @cli ${ glc(this, this.collabWindow.clientId) } seq ${ seq } clientId ${ glc(this, clientId) }`);
					console.log(tempPartialLengths.toString());
					console.log("b4 " + bplStr);
					console.log(node.partialLengths.toString());
				}
			}
			else {
				node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
			}
		}
	}

	blockUpdateLength(node: IMergeBlock, seq : number, clientId : number) {
		this.blockUpdate(node);
		if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
			if (node.partialLengths != = undefined) {
				//nodeCompareUpdateLength(node, seq, clientId);
				if (MergeTree.options.incrementalUpdate) {
					node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
				}
				else {
					node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
				}
			}
			else {
				node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
			}
		}
	}

	map<TClientData>(actions: SegmentActions<TClientData>, refSeq : number, clientId : number, accum ? : TClientData) {
		// TODO: optimize to avoid comparisons
		this.nodeMap(this.root, actions, 0, refSeq, clientId, accum);
	}

	mapRange<TClientData>(actions: SegmentActions<TClientData>, refSeq : number, clientId : number, accum ? : TClientData, start ? : number, end ? : number) {
		this.nodeMap(this.root, actions, 0, refSeq, clientId, accum, start, end);
	}

	rangeToString(start: number, end : number) {
		let strbuf = "";
		for (let childIndex = 0; childIndex < this.root.childCount; childIndex++) {
			let child = this.root.children[childIndex];
			if (!child.isLeaf()) {
				let block = <IMergeBlock>child;
				let len = this.blockLength(block, UniversalSequenceNumber,
					this.collabWindow.clientId);
				if ((start <= len) && (end > 0)) {
					strbuf += this.nodeToString(block, strbuf, 0);
				}
				start -= len;
				end -= len;
			}
		}
		return strbuf;
	}

	nodeToString(block: IMergeBlock, strbuf : string, indentCount = 0) {
		strbuf += internedSpaces(indentCount);
		strbuf += `Node (len ${ block.cachedLength }) p len(${ block.parent ? block.parent.cachedLength : 0 }) ord $ { ordinalToArray(block.ordinal) } with ${ block.childCount } segs:\n`;
			if (this.blockUpdateMarkers) {
				strbuf += internedSpaces(indentCount);
				strbuf += (<IHierBlock>block).hierToString(indentCount);
			}
		if (this.collabWindow.collaborating) {
			strbuf += internedSpaces(indentCount);
			strbuf += block.partialLengths.toString((id) = > glc(this, id), indentCount) + '\n';
		}
		let children = block.children;
		for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
			let child = children[childIndex];
			if (!child.isLeaf()) {
				strbuf = this.nodeToString(<IMergeBlock>child, strbuf, indentCount + 4);
			}
			else {
				let segment = <Segment>child;
				strbuf += internedSpaces(indentCount + 4);
				strbuf += `cli: ${ glc(this, segment.clientId) } seq: ${ segment.seq } ord: ${ ordinalToArray(segment.ordinal) }`;
					let segBranchId = this.getBranchId(segment.clientId);
				let branchId = this.localBranchId;
				let removalInfo = this.getRemovalInfo(branchId, segBranchId, segment);
				if (removalInfo.removedSeq != = undefined) {
					strbuf += ` rcli: ${ glc(this, removalInfo.removedClientId) } rseq: ${ removalInfo.removedSeq }`;
				}
				strbuf += "\n";
				strbuf += internedSpaces(indentCount + 4);
				strbuf += segment.toString();
				strbuf += "\n";
			}
		}
		return strbuf;
	}

	toString() {
		return this.nodeToString(this.root, "", 0);
	}

	incrementalBlockMap<TContext>(stateStack: Collections.Stack<IncrementalMapState<TContext>>) {
		while (!stateStack.empty()) {
			let state = stateStack.top();
			if (state.op != IncrementalExecOp.Go) {
				return;
			}
			if (state.childIndex == 0) {
				if (state.start == = undefined) {
					state.start = 0;
				}
				if (state.end == = undefined) {
					state.end = this.blockLength(state.block, state.refSeq, state.clientId);
				}

				if (state.actions.pre) {
					state.actions.pre(state);
				}
			}
			if ((state.op == IncrementalExecOp.Go) && (state.childIndex < state.block.childCount)) {
				let child = state.block.children[state.childIndex];
				let len = this.nodeLength(child, state.refSeq, state.clientId);
				if (MergeTree.traceIncrTraversal) {
					if (child.isLeaf()) {
						console.log(`considering (r ${ state.refSeq } c ${ glc(this, state.clientId) }) seg with text $ { (<TextSegment>child).text } len ${ len } seq ${ (<Segment>child).seq } rseq ${ (<Segment>child).removedSeq } cli ${ glc(this, (<Segment>child).clientId) }`);
					}
				}
				if ((len > 0) && (state.start < len) && (state.end > 0)) {
					if (!child.isLeaf()) {
						let childState = new IncrementalMapState(<IMergeBlock>child, state.actions, state.pos,
							state.refSeq, state.clientId, state.context, state.start, state.end, 0);
						stateStack.push(childState);
					}
					else {
						if (MergeTree.traceIncrTraversal) {
							console.log(`action on seg with text ${ (<TextSegment>child).text }`);
						}
						state.actions.leaf(<Segment>child, state);
					}
				}
				state.pos += len;
				state.start -= len;
				state.end -= len;
				state.childIndex++;
			}
			else {
				if (state.childIndex == state.block.childCount) {
					if ((state.op == IncrementalExecOp.Go) && state.actions.post) {
						state.actions.post(state);
					}
					stateStack.pop();
				}
			}
		}
	}

	nodeMap<TClientData>(node: IMergeBlock, actions : SegmentActions<TClientData>, pos : number, refSeq : number,
		clientId : number, accum ? : TClientData, start ? : number, end ? : number) {
		if (start == = undefined) {
			start = 0;
		}
		if (end == = undefined) {
			end = this.blockLength(node, refSeq, clientId);
		}
		let go = true;
		if (actions.pre) {
			go = actions.pre(node, pos, refSeq, clientId, start, end, accum);
			if (!go) {
				// cancel this node but not entire traversal
				return true;
			}
		}
		let children = node.children;
		for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
			let child = children[childIndex];
			let len = this.nodeLength(child, refSeq, clientId);
			if (MergeTree.traceTraversal) {
				let segInfo : string;
				if ((!child.isLeaf()) && this.collabWindow.collaborating) {
					segInfo = `minLength: ${ (<IMergeBlock>child).partialLengths.minLength }`;
				}
				else {
					let segment = <Segment>child;
					segInfo = `cli: ${ glc(this, segment.clientId) } seq: ${ segment.seq } text: '${segment.toString()}'`;
						if (segment.removedSeq != = undefined) {
							segInfo += ` rcli: ${ glc(this, segment.removedClientId) } rseq: ${ segment.removedSeq }`;
						}
				}
				console.log(`@tcli ${ glc(this, this.collabWindow.clientId) }: map len : ${ len } start: ${ start } end: ${ end } ` + segInfo);
			}
			let isLeaf = child.isLeaf();
			if (go && (end > 0) && (len > 0) && (start < len)) {
				// found entry containing pos
				if (!isLeaf) {
					if (go) {
						go = this.nodeMap(<IMergeBlock>child, actions, pos, refSeq, clientId, accum, start, end);
					}
				}
				else {
					if (MergeTree.traceTraversal) {
						console.log(`@tcli ${ glc(this, this.collabWindow.clientId) }: map leaf action`);
					}
					go = actions.leaf(<Segment>child, pos, refSeq, clientId, start, end, accum);
				}
			}
			if (!go) {
				break;
			}
			if (actions.shift) {
				actions.shift(child, pos, refSeq, clientId, start, end, accum);
			}
			pos += len;
			start -= len;
			end -= len;
		}
		if (go && actions.post) {
			go = actions.post(node, pos, refSeq, clientId, start, end, accum);
		}

		return go;
	}

	// straight call every segment; goes until leaf action returns false
	nodeMapReverse<TClientData>(block: IMergeBlock, actions : SegmentActions<TClientData>, pos : number, refSeq : number,
		clientId : number, accum ? : TClientData) {
		let go = true;
		let children = block.children;
		for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
			let child = children[childIndex];
			let isLeaf = child.isLeaf();
			if (go) {
				// found entry containing pos
				if (!isLeaf) {
					if (go) {
						go = this.nodeMapReverse(<IMergeBlock>child, actions, pos, refSeq, clientId, accum);
					}
				}
				else {
					go = actions.leaf(<Segment>child, pos, refSeq, clientId, 0, 0, accum);
				}
			}
			if (!go) {
				break;
			}
		}
		return go;
	}

#endif // NOTYET

};

