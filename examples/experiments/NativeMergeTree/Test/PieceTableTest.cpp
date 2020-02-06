#include "PieceTable.h"

#include "CppUnitTest.h"
using namespace Microsoft::VisualStudio::CppUnitTestFramework;

TEST_CLASS(PieceTableTest)
{
TEST_METHOD(PieceTable_BasicUsage)
{
	PieceTable pt;
	pt.Replace(0, 0, "The fox");
	pt.Replace(4, 0, "slow ");
	pt.Replace(9, 0, "brown ");
	pt.Replace(4, 5, "quick ");

	Assert::IsTrue(pt.Fetch(0) == "The ");
	Assert::IsTrue(pt.Fetch(2) == "e ");
	Assert::IsTrue(pt.Fetch(4) == "quick ");
	Assert::IsTrue(pt.Fetch(10) == "brown ");
	Assert::IsTrue(pt.Fetch(16) == "fox");
	Assert::IsTrue(pt.Fetch(19) == "");

}
};
