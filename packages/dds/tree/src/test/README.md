# test

This folder contains tests for the whole package.
The folder hierarchy within mirrors that of the rest of the `src` directory.

In general, these tests should be organized such that every file under `src` has a corresponding file under `src/test`.

Files under `src/test/` are identified by their "test file kind", which is indicated by an extra `.` delimited section before the file extension. For example `foo.spec.ts` is a `spec` test file.

Files `src/test/` should fall into one of these kinds:

 - None: These are regular TypeScript files, like `foo.ts`. These should never contain top level test suites. They are files which exist to be imported by other kinds of test files. They can contain functions which generate test suites, or other test utilities.
 - `spec`: These are Mocha test suites, and should correspond to a matching file under `src`.
For example `src/foo/bar.ts` would have its test suite in `src/test/foo/bar.spec.ts`. These files should define a single top level suite (using `describe`) which is named after the file being tested (without extension).
If ambiguous, additional qualifiers can be added to the suite name, like "simple-tree util" if this name would collide.
Unless otherwise documented in that file, this file should contain the unit tests for the logic in the corresponding source file.
Unless otherwise documented, the tests should be organized matching the structure of the file being tested.
For example every top level item in the file gets its own test or test suite inside the field/module's test suite, and this is recursively applied to the inner members/suites.
If test coverage of the logic is tested elsewhere (for example as part of some other nested suite in the same file, or as part of some other file's tests), this should be noted with a comment in both locations.
These `spec` tests should confirm that each member in the file being tested meets its documented specification (its API's doc comments, and any additional behavior implied by its types or naming): again exceptions to this are allowed but should be documented.
Assuming all code has such tests, and only relies of documented behavior of the code its using, tests following this pattern should be sufficient for localizing bugs (determining which code fails to conform to its documentation, regardless of if its due to depending on undocumented behaviors of other code or some other kind of logic bug).
In practice, testing of this type will not cover all cases: this is expected.
When a testing gap is found and determined worth covering (for example due to a bug, new code, or audit of coverage), it should always be possible to address it by adding more tests following this pattern (for example regression tests can always be implemented as a `spec` test for the code which contained the bug).
Note that the fact that this approach is always possible does not make it the best approach: using spec tests in this way should be the first option considered, but if a better testing approach is found, it can be used instead as long as it is documented appropriately.
- `integration`: Tests for using multiple APIs together.
If there is a corresponding `spec` file which is sufficiently large in scope, the tests should be placed within it:
only when the tests don't cleanly correspond to a particular source file should a separate `integration` file be created.
When created, the file should be placed in the `src/test` directory's sub folder which is the most nested it can be while still including all the relevant APIs.
For example tests and examples of using `src/thing/foo` with `src/thing/bar` would belong in `src/test/thing` and could be named something like `fooWithBar.integration.ts`.
If it is not entirely clear exactly what tests belong in a given `integration` file based on just the file name, a doc comment should be included at the top explaining the scope.

Any other kinds of test files should be documented when created by adding them to this list.

## Examples

Code showing how to use an API can be included in tests.
Such tests should mention that they are an "example" somewhere in the file name, suite or test name.
These are not intended to serve as tests for the APIs, but are written as tests to ensure the examples stay up to date.
If there is a corresponding `spec` file, the examples should be included within it: only when the examples don't cleanly correspond to a particular source file should a separate `examples` file be created. When created, the file should be places in the `src/test` directory's sub folder which corresponds to the most nested it can be while still including all the relevant APIs. For example an example of using `src/thing/foo` with `src/thing/bar` would belong in `src/test/thing` and could be named something like `fooWithBar.example.ts`.

## Test Tagging

Tests can be [tagged](https://mochajs.org/next/explainers/tagging/).

This currently has a few uses:

- The `@fluid-tools/benchmark` uses tags to identify its benchmarks.
- `@Smoke` is used to identify a small number of cheap to run tests which can be included in [smoke tests](https://en.wikipedia.org/wiki/Smoke_testing_(software)) and run when its not worth running all the tests.
Currently this is applied to the CJS tests to ensure that the CJS build functions at all while avoiding running the full mostly redundant suite for it.
This may be applied to other configuration in the future.

## Document Status

This is written aspirationalally: much of our current test suite only roughly approximates the patterns described above.
Both this document and the test suite should evolve in a way to converge on a set of patterns which is both documented and followed.

It is expected that at least one other kind of test suite will be created for the purposes of integration testing multiple components.

This approach could be applied to the rest of the Fluid Framework repository, however many packages currently have logic which filters which files are loaded based on file name which may need to be adjusted.
Additionally some packages also use testing tools other than Mocha which further complicates things.
Therefore this policy is currently specific to this package, but future work (to both the policy and the other packages) could generalize it.
