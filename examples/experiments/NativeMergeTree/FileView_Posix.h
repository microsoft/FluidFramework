#pragma once

#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/mman.h>
#include <string_view>

struct FileView
{
	using CharType = char;

private:
	int m_fd;
	void *m_pv;
	struct stat m_fileStat;

	std::basic_string_view<CharType> m_view;

public:
	FileView(const char *path)
	{

		m_fd = open(path, O_RDONLY);
		if (m_fd == -1)
			throw errno;

		if (fstat(m_fd, &m_fileStat) == -1)
			throw errno;

		m_pv = mmap(NULL, m_fileStat.st_size, PROT_READ, MAP_SHARED, m_fd, 0);
		if (m_pv == MAP_FAILED)
			throw errno;

		m_view = std::string_view(static_cast<CharType *>(m_pv), m_fileStat.st_size / sizeof(CharType));
	}

	~FileView()
	{
		munmap(m_pv, m_fileStat.st_size);
		close(m_fd);
	}

	FileView(const FileView &) = delete;
	FileView &operator=(const FileView &) = delete;

	auto Data() const
	{
		return m_view;
	}
};
