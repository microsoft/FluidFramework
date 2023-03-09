# benchmark

This directory contains contents derived from https://github.com/bestiejs/benchmark.js and some types from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/benchmark/index.d.ts

This copy diverges from the original for a few reasons:

1. The original is javascript not TypeScript.
2. The original support older tools and environments (like AMD modules, old buggy browsers etc) which dropping support for can simplify things.
3. The original can be problematic to make work with bundlers, particularly from TypeScript.
4. The original supports more features than we need (like suites).
5. The original focused on delivering minimal overhead micro-benchmarking across all runtimes via generating function source code.
   This version prefers simplicity even if it means slightly more overhead (and modern runtimes we care about likely have very little overhead when composing functions at runtime instead of via source generation.)
   So far no increase in overhead has been measured (it actually lowered when moving to ESM).

# Note

Clearly great care with into the the version of benchmark.js this was based on to ensure it worked well in a variety of environments and had nice API for end users of the library.
This version is not like that.
As much as possibly functionality not required for the single benchmark driver library here has been removed.
Careful configuration and tuning has been discarded, and most configurations are untested.
This version is intended to only support two configurations:

1. TypeScript targeting CommonJS for NodeJS version 14+
2. TypeScript targeting ESM for use with Webpack and current major browsers.

While this first case worked ok with the original benchmark.js, the second one had some minor issues which this fork intends to resolve.
This could have been fixed by patching the original,
but since the use cases here are significantly different and the original is not actively accepting patches for this,
this fork was created.
