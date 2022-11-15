# @fluidframework/azure-scenario-runner

Scenario runnner for FRS and Azure Local Service. This package can be used to create and execute various scenarios involving azure-client, IFluidContainer and a range of distributed data structures (DDSes), while collecting telemetry and validating state in the process. Scenarios are sourced via yaml config files.

## Running the Perf Test

1. Set the `azure__fluid__relay__service__tenantId` environment variable to equal your FRS TenantID
2. Set the `azure__fluid__relay__service__function__url` environment variable to equal your FRS Service Function URL
3. Run the test for the region of your tenant (ex. `npm run start:westus2`)
