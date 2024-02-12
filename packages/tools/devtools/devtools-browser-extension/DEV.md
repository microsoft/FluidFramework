# @fluid-internal/devtools-browser-extension

## Building

To build the package, run `npm run build` in a terminal at the root directory of this package.

## Testing

### Automated Testing

This package uses two different testing libraries for its unit vs end-to-end tests.
To run all of the automated tests, run `npm run test` in a terminal from the root directory of this package.

#### Unit Tests

This package uses [mocha](https://mochajs.org/) for its unit tests.
To run just the unit tests, run `npm run test:mocha` in a terminal from the root directory of this package.

#### End-To-End Tests

This package uses [jest](https://jestjs.io/) and a small backing test app to test end-to-end scenarios in a browser environment.
To run the automated end-to-end tests, run `npm run test:jest` in a terminal from the root directory of this package.

### Local Extension Testing

To use a local build of this extension in your browser:

1. Build this package and its dependencies.
   Your extension files should be generated under the build output directory (`dist/bundle`) in this package directory.
2. Load the unpacked extension in the browser by following [these instructions](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked).
    - For [Windows Subsystem for Linux (WSL)](https://learn.microsoft.com/en-us/windows/wsl/about) users, your Linux files should be at a \\wsl$ path.
      In File Explorer or any other Windows application that can browse files, navigate to the path: \\wsl$.
    - If you are working in a [Codespace](https://code.visualstudio.com/docs/remote/codespaces) with Visual Studio Code, you can download the build artifacts by right-clicking on `dist/bundle` in the `Explorer` view and clicking `download`. This will download the files to your local machine, which you can upload to the browser.

### Sending local usage data to Kusto

When doing development on the Devtools browser extension, usage telemetry can be optionally generated and sent to Kusto. To do so, follow these instructions. Note that this is only available to internal Fluid Framework devs.

1. Create a .env file in the devtools-browser-extension's root folder.
2. The file should have a single line that reads `DEVTOOLS_TELEMETRY_TOKEN=PLACEHOLDER_KEY`. Replace PLACEHOLDER_KEY with the ingestion key. Currently this Consult Alejandro/Wayne to receive this key.
3. Run `pnpm run build` to build the extension.
4. Load the unpacked extension in the browser by following the instructions above.
5. When using the extension on the Devtools example app, ensure that Send Usage Telemetry is toggled in Settings.
6. After using the extension, go to the Office Fluid Test database in Kusto and query the `office_fluid_devtools_generic` table.

You should now see the Devtools usage telemetry events appear!
