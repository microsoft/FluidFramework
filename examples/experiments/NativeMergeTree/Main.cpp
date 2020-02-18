#include "MergeTree.h"
#include "PieceTable.h"
#include <chrono>
FileTable vft;
// Reads a file at 'path', and creates a segment for each line of the file
// Pass cCopies > 1 to load multiple copies of the file, if you need bigger data
std::vector<std::shared_ptr<Segment>> LoadFileIntoSegments(const char *path, int cCopies)
{
	FN fn = vft.Open(path);
	FileView &fileView = *vft.Get(fn);
//	FileView fileView(path);
	std::vector<std::shared_ptr<Segment>> segments;

	for (int n = 0; n < cCopies; n++)
	{
		std::string_view text = fileView.Data();
		size_t i = text.find('\n');
		while (i != std::string_view::npos)
		{
			//segments.push_back(std::make_shared<TextSegment>(text.substr(0, i + 1)));
			segments.push_back(std::make_shared<ExternalSegment>(fn, text.data(), static_cast<int>(i + 1)));
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
			doc.Replace(cp + static_cast<int>(pos), static_cast<int>(svReplace.size()), svReplacement);
			cReplaces++;
			cp += static_cast<int>(pos + svReplace.size());
		}
		else
#endif // TEST_REPLACE
		{
			cp += static_cast<int>(run.size());
		}
	}

	std::chrono::high_resolution_clock::time_point ts2 = std::chrono::high_resolution_clock::now();
	printf("Runtime: %lld us\n", std::chrono::duration_cast<std::chrono::microseconds>(ts2 - ts1).count());
	printf("Fetch count: %d\n", cFetches);
	printf("Replace count: %d\n", cReplaces);
}

void RunFindReplaceTest_MergeTree(const char *path)
{
	printf("== Merge tree find/replace test ==\n");

	using namespace std::string_view_literals;
	SimpleLoopbackRouter router;
	MergeTree doc(&router);
	auto tsBeforeLoad = std::chrono::high_resolution_clock::now();
	auto segments = LoadFileIntoSegments(path, 1);
	auto tsAfterLoad = std::chrono::high_resolution_clock::now();
	printf("Load time: %lld\n", std::chrono::duration_cast<std::chrono::nanoseconds>(tsAfterLoad - tsBeforeLoad).count());
	doc.ReloadFromSegments(std::move(segments));

	// s/the/teh
	constexpr std::string_view svReplace("the"sv);
	constexpr std::string_view svReplacement("teh"sv);

	std::chrono::high_resolution_clock::time_point ts1 = std::chrono::high_resolution_clock::now();

	CharacterPosition cp(0);
	const CharacterPosition cpMac = doc.CpMac();
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
			doc.Replace(cp + static_cast<int>(pos), static_cast<int>(svReplace.size()), svReplacement);
			cReplaces++;
			cp = cp + static_cast<int>(pos + svReplace.size());
		}
		else
#endif // TEST_REPLACE
		{
			cp = cp + static_cast<int>(run.size());
		}
	}
	//doc.CommitTransaction(txn, Seq::Create(1));

	std::chrono::high_resolution_clock::time_point ts2 = std::chrono::high_resolution_clock::now();
	printf("Runtime: %lld us\n", std::chrono::duration_cast<std::chrono::microseconds>(ts2 - ts1).count());
	printf("Fetch count: %d\n", cFetches);
	printf("Replace count: %d\n", cReplaces);

	doc.checkInvariants();
}

std::array<std::chrono::high_resolution_clock::time_point, 1'000'000> times;
uint32_t ctimes = 0;

void PrintTimes()
{
	for (uint32_t i = 1; i < ctimes; i++)
	{
		auto dnsec = std::chrono::duration_cast<std::chrono::nanoseconds>(times[i] - times[i - 1]);
		printf("%d: %lld\n", i, dnsec.count());
	}
}

void ComplexTreePerfTest()
{
	SimpleLoopbackRouter router;
	router.maxQueueLength = std::numeric_limits<uint32_t>::max();
	MergeTree doc(&router);

	for (uint32_t i = 0; i < times.size() * 100; i++)
	{
		doc.Replace(CharacterPosition(0), 0, "a");
		if (i % 100 == 0)
			times[ctimes++] = std::chrono::high_resolution_clock::now();
	}

	printf("depthMin:%d depthMax:%d\n", doc.root->stats.depthMin, doc.root->stats.depthMax);
	PrintTimes();
}

void DeepCollabWindowPerfTest()
{
	MultiClientRouter<2> router;
	MergeTree doc0(&router.endpoints[0]);
	MergeTree doc1(&router.endpoints[1]);

	for (uint32_t i = 0; i < times.size(); i++)
	{
		doc0.Replace(doc0.CpMac(), 0, "a");
		if (i % 100 == 0)
		{
			router.PumpMessages();
			times[ctimes++] = std::chrono::high_resolution_clock::now();
		}
	}

	PrintTimes();
}

int main(int argc, char **argv)
{
#ifdef __EMSCRIPTEN__
		RunFindReplaceTest_MergeTree("assets/pp10.txt");
#else

#ifndef _DEBUG
	// The VS builtin profiler takes a few seconds to kick in
	//Sleep(3000);
#endif

	//ComplexTreePerfTest();
	//return 0;

	const char *pp10path = "../../../packages/server/gateway/public/literature/pp10.txt";

	if (argc > 1 && strcmp(argv[1], "piecetable") == 0)
		RunFindReplaceTest_PieceTable(pp10path);
	else //if (strcmp(argv[1], "mergetree"))
		RunFindReplaceTest_MergeTree(pp10path);
#endif
}
