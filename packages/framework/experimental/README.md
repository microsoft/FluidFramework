# Framework Experimental

This package contains experimental portions of the framework, primarily interface definitions for the framework's component model.

These interfaces are designed to support scenarios requiring cooperation between distinct components, or between components and the app.  Interfaces in this package are still in development, and may be incomplete or need additional iteration before they can be promoted to the framework itself.  Consumers of this package should be prepared for breaking changes.

## Contributing

If you'd like to contribute an interface to the framework, please file a Github issue and work with the project contributors to evaluate the interface and its suitability for the package before submitting a pull request.

Although experimental, code in this package still must abide by the coding guidelines of the framework and runtime.  APIs must be well documented with both TSDoc comments and a README explaining target scenarios and usage, and implementations should have unit tests.
