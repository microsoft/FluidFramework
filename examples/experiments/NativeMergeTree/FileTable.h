#pragma once
#include <vector>
#include <cassert>
#include "array_view.h"

using FN = uint16_t;
constexpr const FN fnNil = std::numeric_limits<uint16_t>::max();

struct FileTable
{
private:
	std::vector<std::unique_ptr<FileView>> files;

public:
	FileView * Get(FN fn)
	{
		if (fn >= files.size())
		{
			assert(false);
			return nullptr;
		}

		assert(files[fn] != nullptr);
		return files[fn].get();
	}

	FN Open(const char *path)
	{
		// Need to handle this eventually, but not for a while
		assert(files.size() < fnNil / 2);

		files.push_back(std::make_unique<FileView>(path));
		return static_cast<FN>(files.size() - 1);
	}

	
};