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

### Enpdoint names

When running tests against ODSP or R11s, be mindful of a second parameter/flag usually referred to as the "endpoint name".
This should match the target environment you want to run against or the test driver might configure things in a way
that the target environment doesn't expect, and you could see weird and unexpected errors when running tests.

For ODSP, the possible endpoint names are `odsp` (for a tenant in the production ODSP environment) and `odsp-df`
(for the dogfood environment).
The default is `odsp`.
For Routerlicious, they are `r11s` (for the internal cluster in Azure) and `docker` (when running routerlicious locally
in docker with our development setup).
The default is `r11s`.

For example:

```bash
npm run test:realsvc:run -- --driver=odsp
npm run test:realsvc:run -- --driver=odsp --odspEndpointName=odsp-df
npm run test:realsvc:run -- --driver=r11s
npm run test:realsvc:run -- --driver=r11s --r11sEndpointName=docker
```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
