//#include "Windows.h"
#include "seq.h"
#include "PartialLengths.h"
#include "MergeTree.h"

#include "CppUnitTest.h"
using namespace Microsoft::VisualStudio::CppUnitTestFramework;

TEST_CLASS(AdjustCpTest)
{
static Adjustment Adjust(int cp, int dcp)
{
	return Adjustment { CharacterPosition(cp), dcp };
}

static void Check(int cp, const Adjustment &adj, int cpExpected)
{
	CharacterPosition actual = CpAdjustCp(CharacterPosition(cp), adj);
	CharacterPosition expected(cpExpected);
	Assert::AreEqual(expected.AsInt(), actual.AsInt());
}

TEST_METHOD(TestZeroAdjust)
{
	Check(5, Adjust(4, 0), 5);
	Check(5, Adjust(5, 0), 5);
	Check(5, Adjust(6, 0), 5);
}

TEST_METHOD(TestPositiveAdjust)
{
	Check(4, Adjust(5, 7), 4);
	Check(5, Adjust(5, 7), 12);
	Check(6, Adjust(5, 7), 13);
}

TEST_METHOD(TestNegativeAdjust)
{
	Check(4, Adjust(5, -2), 4);
	Check(5, Adjust(5, -2), 5);
	Check(6, Adjust(5, -2), 5);
	Check(7, Adjust(5, -2), 5);
	Check(8, Adjust(5, -2), 6);
}
};

std::shared_ptr<MergeBlock> MakeMergeBlock(std::initializer_list<std::shared_ptr<MergeNode>> nodes)
{
	return std::make_shared<MergeBlock>(nodes.begin(), nodes.end());
}

TEST_CLASS(MergeTreeTest)
{
SimpleLoopbackRouter router;

MergeTree MakeTestMergeTree()
{
	MergeTree doc(&router);

	// 0: The fox
	// 1: The slow fox
	// 2: The slow brown fox
	// 3: The quick brown fox
	std::vector<std::shared_ptr<Segment>> segments;
	segments.push_back(std::make_shared<TextSegment>("The fox"));
	doc.ReloadFromSegments(std::move(segments));

	doc.Replace(CharacterPosition(4), 0, "slow ");
	doc.Replace(CharacterPosition(9), 0, "brown ");
	doc.Replace(CharacterPosition(4), 4, "quick");

	return doc;
}

void AssertDoc(MergeTree &doc, std::string_view text)
{
	std::string strDoc;
	CharacterPosition cp(0);
	while (cp < doc.CpMac())
	{
		std::string_view run = doc.Fetch(cp);
		strDoc += run;
		cp = cp + run.length();
	}

	Assert::AreEqual(std::string(text), strDoc);
}

TEST_METHOD(MergeNodeIterator1)
{
	MergeTree doc = MakeTestMergeTree();
	MergeNodeIterator it(doc.root.get());

	Assert::IsTrue(it.Node() == doc.root.get());
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root->children[0].get()); // "The "
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root->children[1].get()); // "slow"
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root->children[2].get()); // "quick"
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root->children[3].get()); // " "
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root->children[4].get()); // "brown "
	Assert::IsTrue(it.Next());
	Assert::IsTrue(it.Node() == doc.root->children[5].get()); // "fox"
	Assert::IsFalse(it.Next());
	Assert::IsTrue(it.Node() == nullptr);
	Assert::IsTrue(it.IsEnd());
}

TEST_METHOD(MergeTree_BasicFetch)
{
	MergeTree doc = MakeTestMergeTree();

	Assert::IsTrue(doc.Fetch(CharacterPosition(0)) == "The ");
	Assert::IsTrue(doc.Fetch(CharacterPosition(4)) == "quick");
	Assert::IsTrue(doc.Fetch(CharacterPosition(9)) == " ");
	Assert::IsTrue(doc.Fetch(CharacterPosition(10)) == "brown ");
	Assert::IsTrue(doc.Fetch(CharacterPosition(16)) == "fox");
	AssertDoc(doc, "The quick brown fox");
}

TEST_METHOD(MergeTree_BasicReplace)
{
	MergeTree doc = MakeTestMergeTree();
}

TEST_METHOD(MergeTree_AppendMany)
{
	MergeTree doc(&router);

	for (int i = 0; i < 500; i++)
		doc.Replace(doc.CpMac(), 0, "a");

	AssertDoc(doc, std::string(500, 'a'));
}

#ifdef TODO
TEST_METHOD(MergeTree_Arborist)
{
	std::shared_ptr<MergeBlock> b1 = MakeMergeBlock({
		std::make_shared<TextSegment>(Seq::Universal(), ClientId::Nil(), "a"),
		std::make_shared<TextSegment>(Seq::Universal(), ClientId::Nil(), "b"),
		std::make_shared<TextSegment>(Seq::Universal(), ClientId::Nil(), "c"),
		});

	std::shared_ptr<MergeBlock> b2 = MakeMergeBlock({ b1 });
	std::shared_ptr<MergeBlock> b3 = MakeMergeBlock({ b2 });

	MergeTree doc;
	doc.root = std::move(*b3);

	assert(doc.root.IsUnbalanced());

	bool fKeepGoing = true;
	doc.RunMaintenance(fKeepGoing);

	assert(!doc.root.IsUnbalanced());
	AssertDoc(doc, Seq::Universal(), "abc");
}
#endif
};
