import {
    IChaincodeFactory,
    ICodeLoader,
    IPraguePackage,
} from "@prague/runtime-definitions";
import Axios from "axios";

export class WebLoader implements ICodeLoader {
    constructor(private baseUrl: string) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        const [, scope, name, version] = components;
        const packageUrl = `${this.baseUrl}/${encodeURI(scope)}/${encodeURI(`${name}@${version}`)}`;
        const packageJson = await Axios.get<IPraguePackage>(`${packageUrl}/package.json`);

        const fetchedFiles = new Array<Promise<string>>();
        for (const bundle of packageJson.data.prague.browser.bundle) {
            const file = Axios.get<string>(
                `${packageUrl}/${bundle}`,
                { responseType: "string" }).then((data) => data.data);
            fetchedFiles.push(file);
        }

        const files = await Promise.all(fetchedFiles);
        for (const file of files) {
            // TODO using eval for now but likely will want to switch to a script import with a wrapped context
            // to isolate the code
            // tslint:disable-next-line:no-eval
            eval.call(null, file);
        }

        // tslint:disable-next-line:no-unsafe-any
        return window[packageJson.data.prague.browser.entrypoint];
    }
}
