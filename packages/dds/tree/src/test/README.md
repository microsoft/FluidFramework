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
In practice testing of this type will not cover all cases, and this is fine, but when a testing gap is found and determined significant (for example due to a bug, new code, or audit of coverage), it should always be possible to address it by adding more tests following this pattern (for example regression tests can always be implemented as a `spec` test for the code which contained the bug).
Note that the fact that this approach is always possible does not make it the best approach: using spec tests in this way should be the first option considered, but if a better testing approach is found, it can be used instead as long as it is documented appropriately.

Any other kinds of test files should be documented when created by adding them to this list.

## Document Status

This is written aspirationalally: much of our current test suite only roughly approximates the patterns described above.
Both this document and the test suite should evolve in a way to converge on a set of patterns which is both documented and followed.

It is expected that at least one other kind of test suite will be created for the purposes of integration testing multiple components.

This approach could be applied to the rest of the Fluid Framework repository, however many packages currently have logic which filters which files are loaded based on file name which may need to be adjusted.
Additionally some packages also use testing tools other than Mocha which further complicates things.
Therefore this policy is currently specific to this package, but future work (to both the policy and the other packages) could generalize it.
