#pragma once
#include <vector>

// string:string_view::array:array_view
template <typename T>
struct array_view
{
private:
	T * p = nullptr;
	size_t c = 0;

public:
	array_view() noexcept = default;
	array_view(const array_view &) = default;
	array_view &operator=(const array_view &) = default;
	array_view(const std::vector<T> &v) noexcept : p(v.data()), c(v.size()) {}

	template <size_t N>
	array_view(const std::array<T, N> &ar) noexcept : p(ar.data(), c(N)) {}

	T *data() const noexcept { return p; }
	size_t size() const noexcept { return c; }
	T *begin() const noexcept { return p; }
	T *end() const noexcept { return p + c; }
	T &operator[](int i) const noexcept { return p[i]; }
};

// FileView is a memory-mapped view of a text file
#ifdef _WIN32
#include "FileView_Win32.h"
#else
#include "FileView_Posix.h"
#endif
