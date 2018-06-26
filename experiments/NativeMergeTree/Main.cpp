#include "MergeTree.h"
#include "PieceTable.h"
#include <chrono>

struct MergeTreePerfTester
{
	MergeTree tree;

	MergeTreePerfTester(std::string_view text)
	{


	}
};

// Reads a file at 'path', and creates a segment for each line of the file
// Pass cCopies > 1 to load multiple copies of the file, if you need bigger data
std::vector<std::unique_ptr<Segment>> LoadFileIntoSegments(const char *path, int cCopies)
{
	FileView fileView(path);
	std::vector<std::unique_ptr<Segment>> segments;

	for (int n = 0; n < cCopies; n++)
	{
		std::string_view text = fileView.Data();
		size_t i = text.find('\n');
		while (i != std::string_view::npos)
		{
			segments.push_back(std::make_unique<TextSegment>(Seq::Universal(), std::string(text.substr(0, i + 1))));
			text.remove_prefix(i + 1);
			i = text.find('\n');
		}
	}

	return segments;
}

#define TEST_REPLACE 1

void RunFindReplaceTest_PieceTable(const char *path)
{
	printf("== Piece table find/replace test ==\n");
	using namespace std::string_view_literals;
	PieceTable doc;
	auto segments = LoadFileIntoSegments(path, 1);
	doc.ReloadFromSegments(std::move(segments));

	// s/the/teh
	constexpr std::string_view svReplace("the"sv);
	constexpr std::string_view svReplacement("teh"sv);

	std::chrono::high_resolution_clock::time_point ts1 = std::chrono::high_resolution_clock::now();

	PieceTable::CP cp = 0;
	const PieceTable::CP cpMac = doc.CpMac();
	int cFetches = 0;
	int cReplaces = 0;
	while (cp < cpMac)
	{
		std::string_view run = doc.Fetch(cp);
		cFetches++;
		
#if TEST_REPLACE
		std::string_view::size_type pos = run.find(svReplace, 0);
		if (pos != std::string_view::npos)
		{
			doc.Replace(cp + pos, svReplace.size(), svReplacement);
			cReplaces++;
			cp += pos + svReplace.size();
		}
		else
#endif // TEST_REPLACE
		{
			cp += run.size();
		}
	}

	std::chrono::high_resolution_clock::time_point ts2 = std::chrono::high_resolution_clock::now();
	printf("Runtime: %I64d us\n", std::chrono::duration_cast<std::chrono::microseconds>(ts2 - ts1).count());
	printf("Fetch count: %d\n", cFetches);
	printf("Replace count: %d\n", cReplaces);
}

void RunFindReplaceTest_MergeTree(const char *path)
{
	printf("== Merge tree find/replace test ==\n");

	using namespace std::string_view_literals;
	MergeTree doc;
	auto segments = LoadFileIntoSegments(path, 1);
	doc.ReloadFromSegments(std::move(segments));

	// s/the/teh
	constexpr std::string_view svReplace("the"sv);
	constexpr std::string_view svReplacement("teh"sv);

	std::chrono::high_resolution_clock::time_point ts1 = std::chrono::high_resolution_clock::now();

	CharacterPosition cp(0);
	const CharacterPosition cpMac = doc.CpMac(Seq::Universal());
	MergeTree::Txn txn = doc.StartTransaction(Seq::Universal());
	int cFetches = 0;
	int cReplaces = 0;
	while (cp < cpMac)
	{
		std::string_view run = doc.Fetch(Seq::Universal(), cp);
		cFetches++;

#if TEST_REPLACE
		std::string_view::size_type pos = run.find(svReplace, 0);
		if (pos != std::string_view::npos)
		{
			doc.Replace(txn, cp + pos, svReplace.size(), svReplacement);
			cReplaces++;
			cp = cp + pos + svReplace.size();
		}
		else
#endif // TEST_REPLACE
		{
			cp = cp + run.size();
		}
	}
	//doc.CommitTransaction(txn, Seq::Create(1));

	std::chrono::high_resolution_clock::time_point ts2 = std::chrono::high_resolution_clock::now();
	printf("Runtime: %I64d us\n", std::chrono::duration_cast<std::chrono::microseconds>(ts2 - ts1).count());
	printf("Fetch count: %d\n", cFetches);
	printf("Replace count: %d\n", cReplaces);
}

void RunMergeTreeMisc()
{
	MergeTree tree;
	{
		auto txn = tree.StartTransaction(Seq::Universal());
		tree.Replace(txn, CharacterPosition(0), 0, "asdf");
		tree.checkInvariants();
	}

#ifdef REMOVED
	{
		auto res = tree.find(Seq::Universal(), CharacterPosition(2));
	}

	Seq seqNew = Seq::Invalid();
	{
		auto txn = tree.startTransaction(Seq::Universal());
		seqNew = txn.seqNew;
		std::unique_ptr<TextSegment> ts2 = std::make_unique<TextSegment>(txn.seqNew, "gh");
		tree.insert(txn, CharacterPosition(4), std::move(ts2));
	}

	{
		tree.commit(seqNew, Seq::Create(2));;
	}

	Seq seqLatest = Seq::Universal();
	auto ts1 = std::chrono::high_resolution_clock::now();
	for (int i = 0; i < 20000; i++)
	{
		auto txn = tree.startTransaction(seqLatest);
		auto segment = std::make_unique<TextSegment>(txn.seqNew, "j");
		tree.insert(txn, CharacterPosition((int)tree.root.lengthMap.getLength(txn.seqBase)), std::move(segment));
		tree.checkInvariants();
		auto ts2 = std::chrono::high_resolution_clock::now();

		seqLatest = txn.seqNew;

		if (i % 1000 == 0)
			printf("Iteration %d: %I64d us\n", i, std::chrono::duration_cast<std::chrono::microseconds>(ts2 - ts1).count());
	}
#endif // REMOVED
}

int main(int argc, char **argv)
{
	if (argc > 1 && strcmp(argv[1], "piecetable") == 0)
		RunFindReplaceTest_PieceTable("C:\\Users\\ravipi\\source\\repos\\Prague\\routerlicious\\public\\literature\\pp10.txt");
	else //if (strcmp(argv[1], "mergetree"))
		RunFindReplaceTest_MergeTree("C:\\Users\\ravipi\\source\\repos\\Prague\\routerlicious\\public\\literature\\pp10.txt");
}
