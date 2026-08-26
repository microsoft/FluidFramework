# AKS End-to-End Tests

`end-to-end-tests.sh` runs the FluidFramework real-service test suite from a local
FluidFramework checkout against an existing self-host deployment in AKS.

## Prerequisites

- Bash, Azure CLI, `jq`, `kubectl`, and Node.js tooling required by the FluidFramework checkout.
- A built FluidFramework checkout. Set `FLUID_DIR` to its repository root.
- Azure access to the subscription, AKS cluster, and Front Door profile.
- A tenant already created for the test suite to use. The tenant key is retrieved through
`tenant-admin.sh`.

## Configure and run

Copy the example parameters file (`end-to-end-tests.parameters.example.json`) and rename it as `end-to-end-tests.parameters.json`.
Then update the file with the deployed resource names.


From the `tools/selfhost` root, run:

```bash
FLUID_DIR=/path/to/FluidFramework \
./azure/end-to-end-tests/end-to-end-tests.sh
```

For compatibility testing, provide the client version, such as `client_v2.1.1`:

```bash
FLUID_DIR=/path/to/FluidFramework \
./azure/end-to-end-tests/end-to-end-tests.sh \
	--compatibility-version client_v2.1.1
```

`end-to-end-tests.sh` authenticates with Azure, obtains AKS credentials, discovers the
Alfred, Nexus, and Historian Azure Front Door endpoints, and retrieves tenant
`key1` through `tenant-admin.sh`. It then exports `fluid__test__driver__custom` and
runs the suite with `--driver=r11s --r11sEndpointName=custom`.

The driver configuration contains the remote service URLs and the tenant secret
only in process memory. It is not written to the parameters file.