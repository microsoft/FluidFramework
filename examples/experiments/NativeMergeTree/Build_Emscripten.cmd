mkdir Emscripten_Build
cd Emscripten_Build
cmake -DCMAKE_TOOLCHAIN_FILE="%EMSCRIPTEN%/cmake/Modules/Platform/Emscripten.cmake" -G "Ninja" %~dp0 %*
