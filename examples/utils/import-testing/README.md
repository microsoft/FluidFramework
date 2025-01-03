# @fluid-example/import-testing

Testing of imports from the Fluid Framework public API surfaces.

When testing that reexporting these APIs works, the reexports can be done from non-test files, then imported from the tests.

Since this public API surface is the API surface intended for use by Fluid applications (and not Fluid Framework internals),
these tests are using the APP facing APIs like Apps would, and thus dependency wise look like example applications.
This results in this package having to be under "examples" to be have the dependencies it needs.
