# This package includes a a simple fluid application complete with a UI view in react to test the fluid App Insights telemetry logger.

## Configuring the logger to send telemtry to your app insights instance

-   within `ClientUtilities.ts`, update the function definition for `initializeTinyliciousClient` to use the AppInsightsLogger with your instances configuration. In most cases, this is simply the most basic config containing your correct connection string.

## Starting the test: run `pnpm run start:test-app` and navigate to http://localhost:8080/ in your web browser.

## Finding your metrics
-   Go to your app insights table and search the customEvents table to find all telemetry events sent by default.
