#pragma once

#define NOMINMAX
#include <Windows.h>
#include <string_view>

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

	FileView(const FileView &) = delete;
	FileView &operator=(const FileView &) = delete;

	auto Data() const { return m_view; }
};

