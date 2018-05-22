import {runtime} from "@augloop/runtime-client";
import {inputSchemaName} from "./common";
import {configureRuntimeForPowerPointWorkflows, IDocTile} from "./main";

let _runtimeInitPromise: Promise<void> = null;
const _serviceUrl = "https://augloop-cluster-prod-gw.westus.cloudapp.azure.com";
const _hostMetadata = {
    appName: "PowerPoint",
    appPlatform: "Win32",
  };

const onResultCallback = (inputSchema: string, input, outputSchema: string, output) => {
    console.log(inputSchema);
    console.log(JSON.stringify(input));
    console.log(outputSchema);
    console.log(JSON.stringify(output));
};

const _hostCallbacks = {
    isFeatureEnabled: null,
    onResult: onResultCallback,
    sendTelemetryEvent: null,
};

function startRuntime(): Promise<void> {
    if (_runtimeInitPromise !== null) {
      return _runtimeInitPromise;
    }

    if (_serviceUrl === undefined || _hostMetadata === undefined || _serviceUrl === null) {
      throw Error("Augmentation Loop runtime initalization failed");
    }

    _runtimeInitPromise = runtime.init(_serviceUrl, _hostMetadata, _hostCallbacks);
    return _runtimeInitPromise;
}

const sampleInput: IDocTile = {
    content: "The cat are fat",
    docId: "Prague-0900",
    id: "some-random-id-00111",
    reqOrd: 1,
    requestTime: 123,
};

export function launch() {
    startRuntime().then(() => {
        configureRuntimeForPowerPointWorkflows(runtime).then(() => {
            runtime.submit(inputSchemaName, sampleInput);
        });
      });
}
