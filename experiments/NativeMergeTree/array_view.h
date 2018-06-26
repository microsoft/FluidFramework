#pragma once
#define NOMINMAX
#include <Windows.h>
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
struct FileView
{
	using CharType = char;

private:
	HANDLE m_hfile;
	HANDLE m_hfileMapping;
	void *m_pv;

	std::basic_string_view<CharType> m_view;

public:
	FileView(const char *path)
	{
		m_hfile = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
		if (m_hfile == INVALID_HANDLE_VALUE)
			throw GetLastError();

		m_hfileMapping = CreateFileMappingA(m_hfile, nullptr, PAGE_READONLY, 0, 0, nullptr);
		if (m_hfileMapping == nullptr)
			throw GetLastError();

		m_pv = MapViewOfFile(m_hfileMapping, FILE_MAP_READ, 0, 0, 0);
		if (m_pv == nullptr)
			throw GetLastError();

		m_view = std::string_view(static_cast<CharType *>(m_pv), GetFileSize(m_hfile, nullptr) / sizeof(CharType));
	}

	~FileView()
	{
		UnmapViewOfFile(m_pv);
		CloseHandle(m_hfileMapping);
		CloseHandle(m_hfile);
	}

	auto Data() const { return m_view; }
};

