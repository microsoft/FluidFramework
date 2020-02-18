cmake_minimum_required(VERSION 3.6)

#set(CMAKE_CXX_FLAGS "-std=c++17 -g4 -O1 --js-opts 0 -s DISABLE_EXCEPTION_CATCHING=0 -s ASSERTIONS=2 -s DEMANGLE_SUPPORT=1 -s CYBERDWARF=1 -s ALLOW_MEMORY_GROWTH=1")
set(CMAKE_CXX_FLAGS "-std=c++17 -O3 --llvm-lto 3 -s ALLOW_MEMORY_GROWTH=1")

set(NATIVEMERGETREE_SOURCES
	"Main.cpp"
)

file(COPY "${PROJECT_SOURCE_DIR}/../../routerlicious/public/literature/"
	DESTINATION "${CMAKE_BINARY_DIR}/assets")

set (NATIVEMERGETREE_HEADERS
	"array_view.h"
	"FileTable.h"
	"Messages.h"
	"MergeTree.h"
	"PartialLengths.h"
	"PieceTable.h"
	"Router.h"
	"Seq.h"
)

set(CMAKE_EXECUTABLE_SUFFIX ".html")
add_executable(NativeMergeTree ${NATIVEMERGETREE_SOURCES})
set_target_properties(NativeMergeTree PROPERTIES LINK_FLAGS "--preload-file assets/  --memory-init-file 0")
