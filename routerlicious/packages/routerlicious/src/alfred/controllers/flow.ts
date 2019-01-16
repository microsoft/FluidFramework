import * as API from "@prague/client-api";
import { start } from "@prague/flow-app";
import * as resources from "@prague/gitresources";

/*
function downloadRawText(textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(document.baseURI, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}
*/

export async function load(
    id: string,
    version: resources.ICommit,
    token: string,
    pageInk: boolean,
    disableCache: boolean,
    config: any,
    template: string,
    connect: boolean,
    options: {},
    credentials: { tenant: string, key: string },
    from: number,
    to: number,
) {
    console.log(`id: ${id} version: ${version} token: ${token} pageInk: ${pageInk} disableCache: ${disableCache}`);
    console.log(`config: ${JSON.stringify(config)} template: ${template} connect: ${connect}`);
    console.log(`credentials: ${JSON.stringify(credentials)} from: ${from} to: ${to}`);

    API.registerChaincodeRepo(config.npm);
    API.registerDefaultCredentials(credentials);

    console.log(`Load Option: ${JSON.stringify(options)}`);
    loadDocument()
    .catch((error) => {
        console.error(error);
    });
}

async function loadDocument() {
    start();
}
