//#include "Windows.h"
#include "seq.h"
#include "LengthMap.h"
#include "MergeTree.h"

#include "CppUnitTest.h"
using namespace Microsoft::VisualStudio::CppUnitTestFramework;

TEST_CLASS(LengthMapTest)
{
public:

using LengthMap = TLengthMap<8>;
		
TEST_METHOD(Entry_Find)
{
	// length map:      1 2 4 8
	// segment lengths: 1 1 2 4 
	LengthMap::Entry entry(Seq::Universal(), { 1,2,4,8 });
	LengthMap::FindResult res = entry.Find(0);
	Assert::AreEqual(0u, (uint32_t)res.index);
	Assert::AreEqual(0, res.relOffset);

	res = entry.Find(1);
	Assert::IsTrue(1 == res.index);
	Assert::IsTrue(0 == res.relOffset);

	res = entry.Find(2);
	Assert::IsTrue(2 == res.index);
	Assert::IsTrue(0 == res.relOffset);

	res = entry.Find(3);
	Assert::IsTrue(2 == res.index);
	Assert::IsTrue(1 == res.relOffset);

	res = entry.Find(4);
	Assert::IsTrue(3 == res.index);
	Assert::IsTrue(0 == res.relOffset);

	res = entry.Find(6);
	Assert::IsTrue(3 == res.index);
	Assert::IsTrue(2 == res.relOffset);

	res = entry.Find(8);
	Assert::IsTrue(4 == res.index);
	Assert::IsTrue(0 == res.relOffset);
}

TEST_METHOD(Entry_Insert)
{
	LengthMap::Entry entry{ Seq::Universal(), {5, 10, 15} };
	entry.InsertColumn(3);
	Assert::IsTrue(LengthMap::Entry{ Seq::Universal(), {5, 10, 15, 15} } == entry);

	entry.InsertColumn(0);
	Assert::IsTrue(LengthMap::Entry{ Seq::Universal(),{ 0, 5, 10, 15, 15 } } == entry);

	entry.InsertColumn(3);
	Assert::IsTrue(LengthMap::Entry{ Seq::Universal(),{ 0, 5, 10, 10, 15, 15 } } == entry);
}

TEST_METHOD(Find)
{
	LengthMap map{ {
		LengthMap::Entry{ Seq::Universal(),{ 0, 0, 4, 7 } },
		LengthMap::Entry{ Seq::Create(1),{ 0, 5, 9, 12 } },
		LengthMap::Entry{ Seq::Create(5),{ 1, 6, 10, 13 } },
	}, 4 };

	auto checkResult = [](const LengthMap::FindResult &f, int relOffsetExpected, int indexExpected) -> void
	{
		Assert::AreEqual(relOffsetExpected, f.relOffset);
		Assert::AreEqual(indexExpected, f.index);
	};

	checkResult(map.Find(Seq::Universal(), 0), 0, 2);
	checkResult(map.Find(Seq::Universal(), 1), 1, 2);
	checkResult(map.Find(Seq::Universal(), 3), 3, 2);
	checkResult(map.Find(Seq::Universal(), 4), 0, 3);
	checkResult(map.Find(Seq::Universal(), 5), 1, 3);
	checkResult(map.Find(Seq::Universal(), 6), 2, 3);
	checkResult(map.Find(Seq::Universal(), 7), 0, 4);
	checkResult(map.Find(Seq::Universal(), 8), 1, 4);

	checkResult(map.Find(Seq::Create(1), 0), 0, 1);
	checkResult(map.Find(Seq::Create(1), 1), 1, 1);
	checkResult(map.Find(Seq::Create(1), 4), 4, 1);
	checkResult(map.Find(Seq::Create(1), 5), 0, 2);
	checkResult(map.Find(Seq::Create(1), 6), 1, 2);
	checkResult(map.Find(Seq::Create(1), 11), 2, 3);
	checkResult(map.Find(Seq::Create(1), 12), 0, 4);

	checkResult(map.Find(Seq::Create(2), 0), 0, 1);
	checkResult(map.Find(Seq::Create(2), 1), 1, 1);
	checkResult(map.Find(Seq::Create(2), 4), 4, 1);
	checkResult(map.Find(Seq::Create(2), 5), 0, 2);
	checkResult(map.Find(Seq::Create(2), 6), 1, 2);
	checkResult(map.Find(Seq::Create(2), 11), 2, 3);
	checkResult(map.Find(Seq::Create(2), 12), 0, 4);

	checkResult(map.Find(Seq::Create(6), 0), 0, 0);
	checkResult(map.Find(Seq::Create(6), 1), 0, 1);
	checkResult(map.Find(Seq::Create(6), 5), 4, 1);
	checkResult(map.Find(Seq::Create(6), 6), 0, 2);
}

TEST_METHOD(GetLength)
{
	LengthMap map{ {
		LengthMap::Entry{ Seq::Universal(), { 0, 0, 5, 10 } },
		LengthMap::Entry{ Seq::Create(1), { 0, 5, 10, 15 } },
		LengthMap::Entry{ Seq::Create(5), { 1, 6, 11, 16 } },
	}, 4 };

	Assert::AreEqual(10u, map.GetLength(Seq::Universal()));
	Assert::AreEqual(15u, map.GetLength(Seq::Create(1)));
	Assert::AreEqual(15u, map.GetLength(Seq::Create(2)));
	Assert::AreEqual(16u, map.GetLength(Seq::Create(5)));
	Assert::AreEqual(16u, map.GetLength(Seq::Create(10)));
}

TEST_METHOD(Insert)
{
	LengthMap map{ {
		{ Seq::Universal(), { 0, 0, 1 } },
		{ Seq::Create(1), { 0, 1, 5 } },
		{ Seq::Create(3), { 1, 5, 10 } },
	}, 3 };

	map.Insert(Seq::Universal(), Seq::Invalid(), 1, 3);
	Assert::IsTrue(map == LengthMap{ {
		{ Seq::Universal(),{ 0, 3, 3, 4 } },
		{ Seq::Create(1),{ 0, 3, 4, 8 } },
		{ Seq::Create(3),{ 1, 4, 8, 13 } },
		}, 4 });

	map.Insert(Seq::Create(1), Seq::Create(3), 0, 2);
	Assert::IsTrue(map == LengthMap{ {
		{ Seq::Universal(),{ 0, 0, 3, 3, 4 } },
		{ Seq::Create(1),{ 2, 2, 5, 6, 10 } },
		{ Seq::Create(3),{ 0, 1, 4, 8, 13 } },
		}, 5 });

}

TEST_METHOD(Split)
{
	LengthMap::Entry entryBefore(Seq::Universal());
	LengthMap::Entry entryAfter(Seq::Universal());

	for (int i = 0; i < LengthMap::BlockSize; i++)
		entryBefore.lengths[i] = i + 1;
	for (int i = LengthMap::BlockSize / 2; i < LengthMap::BlockSize; i++)
		entryAfter.lengths[i] = i - LengthMap::BlockSize / 2;

	LengthMap map1{ {entryBefore}, static_cast<int>(LengthMap::BlockSize) };
	LengthMap map2 = map1.Split();
	Assert::IsTrue(map1 == map2);
}

TEST_METHOD(Commit)
{
	LengthMap map{ {
		LengthMap::Entry{ Seq::Universal(),{ 0, 0, 1 } },
		LengthMap::Entry{ Seq::Create(1),{ 0, 1, 2 } },
		LengthMap::Entry{ Seq::LocalFirst(),{ 1, 2, 3 } },
	}, 3 };

	map.Commit(Seq::LocalFirst(), Seq::Create(2));

	Assert::IsTrue(map == LengthMap{ {
		LengthMap::Entry{ Seq::Universal(),{ 0, 0, 1 } },
		LengthMap::Entry{ Seq::Create(1),{ 0, 1, 2 } },
		LengthMap::Entry{ Seq::Create(2),{ 1, 2, 3 } },
		}, 3 });
}

TEST_METHOD(Equality)
{
	LengthMap m1{{{Seq::Universal(), {1}}}, 1};
	Assert::IsTrue(m1 == m1);

	LengthMap m2{ {
		{ Seq::Universal(), { 0, 1, 2 } },
		{ Seq::Create(1), { 1, 2, 3 } }
	}, 3 };

	Assert::IsTrue(m2 == m2);

	LengthMap m3a{ {
		{ Seq::Universal(), { 0, 1, 2 } },
		{ Seq::Create(2), { 1, 2, 3 } }
	}, 3 };
	LengthMap m3b{ {
		{ Seq::Universal(), { 0, 1, 2 } },
		{ Seq::Create(1), { 0, 1, 2 } },
		{ Seq::Create(2), { 1, 2, 3 } }
	}, 3 };

	Assert::IsTrue(m3a == m3b);
	Assert::IsTrue(m3b == m3a);
	Assert::IsTrue(m3b == m3b);

	LengthMap m4a{ {
		{ Seq::Universal(), { 0, 1, 2 } }
	}, 3 };
	LengthMap m4b{ {
		{ Seq::Universal(), { 0, 1, 2 } },
		{ Seq::Create(1), { 0, 1, 2 } }
	}, 3 };

	Assert::IsTrue(m4a == m4b);
	Assert::IsTrue(m4b == m4a);
}

};

TEST_CLASS(MergeTreeTest)
{
MergeTree MakeTestMergeTree()
{
	MergeTree doc;

	// 0: The fox
	// 1: The slow fox
	// 2: The slow brown fox
	// 3: The quick brown fox
	std::vector<std::shared_ptr<Segment>> segments;
	segments.push_back(std::make_shared<TextSegment>(Seq::Universal(), "The "));
	segments.push_back(std::make_shared<TextSegment>(Seq::Create(1), "slow "));
	segments[1]->seqRemoved = Seq::Create(3);
	segments.push_back(std::make_shared<TextSegment>(Seq::Create(3), "quick "));
	segments.push_back(std::make_shared<TextSegment>(Seq::Create(2), "brown "));
	segments.push_back(std::make_shared<TextSegment>(Seq::Universal(), "fox"));

	doc.ReloadFromSegments(std::move(segments));
	return doc;
}

void AssertDoc(MergeTree &doc, Seq seq, std::string_view text)
{
	std::string strDoc;
	CharacterPosition cp(0);
	while (cp < doc.CpMac(seq))
	{
		std::string_view run = doc.Fetch(seq, cp);
		strDoc += run;
		cp = cp + run.length();
	}

	Assert::AreEqual(std::string(text), strDoc);
}

TEST_METHOD(MergeNodeIterator1)
{
	MergeTree doc = MakeTestMergeTree();
	MergeNodeIterator it(&doc.root);

	Assert::IsTrue(it.Node() == &doc.root);
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root.children[0].get());
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root.children[1].get());
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root.children[2].get());
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root.children[3].get());
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root.children[4].get());
	Assert::IsFalse(it.Next());
	Assert::IsTrue(it.Node() == nullptr);
	Assert::IsTrue(it.IsEnd());
}

TEST_METHOD(MergeTree_BasicFetch)
{
	MergeTree doc = MakeTestMergeTree();

	Assert::IsTrue(doc.Fetch(Seq::Universal(), CharacterPosition(0)) == "The ");
	Assert::IsTrue(doc.Fetch(Seq::Universal(), CharacterPosition(4)) == "fox");
	AssertDoc(doc, Seq::Universal(), "The fox");

	Assert::IsTrue(doc.Fetch(Seq::Create(1), CharacterPosition(0)) == "The ");
	Assert::IsTrue(doc.Fetch(Seq::Create(1), CharacterPosition(4)) == "slow ");
	Assert::IsTrue(doc.Fetch(Seq::Create(1), CharacterPosition(9)) == "fox");
	AssertDoc(doc, Seq::Create(1), "The slow fox");

	Assert::IsTrue(doc.Fetch(Seq::Create(2), CharacterPosition(0)) == "The ");
	Assert::IsTrue(doc.Fetch(Seq::Create(2), CharacterPosition(4)) == "slow ");
	Assert::IsTrue(doc.Fetch(Seq::Create(2), CharacterPosition(9)) == "brown ");
	Assert::IsTrue(doc.Fetch(Seq::Create(2), CharacterPosition(15)) == "fox");
	AssertDoc(doc, Seq::Create(2), "The slow brown fox");

	Assert::IsTrue(doc.Fetch(Seq::Create(3), CharacterPosition(0)) == "The ");
	Assert::IsTrue(doc.Fetch(Seq::Create(3), CharacterPosition(4)) == "quick ");
	Assert::IsTrue(doc.Fetch(Seq::Create(3), CharacterPosition(10)) == "brown ");
	Assert::IsTrue(doc.Fetch(Seq::Create(3), CharacterPosition(16)) == "fox");
	AssertDoc(doc, Seq::Create(3), "The quick brown fox");

	Assert::IsTrue(doc.Fetch(Seq::Create(4), CharacterPosition(0)) == "The ");
	Assert::IsTrue(doc.Fetch(Seq::Create(4), CharacterPosition(4)) == "quick ");
	Assert::IsTrue(doc.Fetch(Seq::Create(4), CharacterPosition(10)) == "brown ");
	Assert::IsTrue(doc.Fetch(Seq::Create(4), CharacterPosition(16)) == "fox");
	AssertDoc(doc, Seq::Create(4), "The quick brown fox");
}

TEST_METHOD(MergeTree_BasicReplace)
{
	MergeTree doc;
	MergeTree::Txn txn;

	txn = doc.StartTransaction(Seq::Universal());
	doc.Replace(txn, CharacterPosition(0), 0, "The fox");
	doc.CommitTransaction(txn, Seq::Create(1));
	AssertDoc(doc, Seq::Create(1), "The fox");

	txn = doc.StartTransaction(Seq::Create(1));
	doc.Replace(txn, CharacterPosition(4), 0, "slow ");
	doc.CommitTransaction(txn, Seq::Create(2));
	AssertDoc(doc, Seq::Create(2), "The slow fox");

	// Recheck that all past revisions still have correct content
	AssertDoc(doc, Seq::Universal(), "");
	AssertDoc(doc, Seq::Create(1), "The fox");
	AssertDoc(doc, Seq::Create(2), "The slow fox");
}

TEST_METHOD(MergeTree_AppendMany)
{
	MergeTree doc;

	Seq seqPrev = Seq::Universal();
	for (int i = 1; i < 500; i++)
	{
		MergeTree::Txn txn = doc.StartTransaction(seqPrev);
		doc.Replace(txn, doc.CpMac(txn->seqBase), 0, "a");
		doc.CommitTransaction(txn, Seq::Create(i));
		seqPrev = Seq::Create(i);
	}

	AssertDoc(doc, seqPrev, std::string(499, 'a'));
}
};