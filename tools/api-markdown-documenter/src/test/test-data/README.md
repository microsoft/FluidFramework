Each directory under this folder represents an "API Model".
Each contains 1 or more `.api.json` files representing individual packages within the model.
End-to-end tests will point to individual model directories for documentation generation testing.

These suites were generated via the following sample repository: https://github.com/Josmithr/api-extractor-playground

Given the complexity of the `.api.json` files API-Extractor generates, it is likely easier to update the test scenarios by using the above repo.
That said, direct modifications can be made _carefully_ to those files if needed.
