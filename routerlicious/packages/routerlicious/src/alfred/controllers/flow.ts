import * as API from "@prague/client-api";
import { start } from "@prague/flow-host";
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
    // 'npm' contains a URL like "http://localhost:3002", but the Verdaccio rest API is on port 4873.
    const verdaccioUrl = new URL(config.npm);
    verdaccioUrl.port = "4873";
    config.verdaccioUrl = verdaccioUrl.toString();

    console.log(`id: ${id} version: ${version} token: ${token} pageInk: ${pageInk} disableCache: ${disableCache}`);
    console.log(`template: ${template} connect: ${connect} from: ${from} to: ${to}`);
    console.log(`config: ${JSON.stringify(config, null, 2)}`);
    console.log(`credentials: ${JSON.stringify(credentials, null, 2)}`);

    API.registerChaincodeRepo(config.npm);
    API.registerDefaultCredentials(credentials);

    console.log(`Load Option: ${JSON.stringify(options)}`);
    loadDocument(config)
    .catch((error) => {
        console.error(error);
    });
}

async function loadDocument(config) {
    start(config, document.getElementById("host-root"));
}
