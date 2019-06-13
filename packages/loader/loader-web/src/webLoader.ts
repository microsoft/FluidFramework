import { ICodeLoader, IPraguePackage } from "@prague/container-definitions";

async function loadScript(scriptUrl: string): Promise<{}> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;

      // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
      // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
      // its dependencies have been loaded and executed.
      script.async = false;

      script.onload = resolve;
      script.onerror = () =>
        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

      document.head.appendChild(script);
    });
}

export class WebLoader implements ICodeLoader {
    constructor(private readonly baseUrl: string) {
    }

    public async load<T>(source: string): Promise<T> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        // TODO: Add caching so you don't download the same chaincode multiple times in a given session.
        const [, scope, name, version] = components;
        const packageUrl = `${this.baseUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;

        const response = await fetch(`${packageUrl}/package.json`);
        const packageJson = await response.json() as IPraguePackage;

        await Promise.all(
            packageJson.prague.browser.bundle.map(async (bundle) => loadScript(`${packageUrl}/${bundle}`)));

        // tslint:disable-next-line:no-unsafe-any
        return window[packageJson.prague.browser.entrypoint];
    }
}
