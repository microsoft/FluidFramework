# @fluid-internal/test-end-to-end-tests

These tests can be written by using the [test-utils](../test-utils/src).

Check out the test-utils [README](../test-utils/README.md) that outlines how to write a test.

## Example

Take a look at the [SharedStringEndToEndTest](src/test/sharedStringEndToEndTests.spec.ts) for a basic example
of how to write an end-to-end test.

That same [directory](src/test) contains more complex examples too.

## "Real Service" Tests

The tests under the `real-service-tests` dir target a live production service like r11s or ODSP's Fluid server.
These are run via `npm run test:realsvc:mocha`, and are included in the CI such that a test failure doesn't
fail the pipeline - since a service outage or network hiccup could cause a failure when no code defect is present.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
