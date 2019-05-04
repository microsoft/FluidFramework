import { IPragueResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
// import { IComponent } from "@prague/runtime-definitions";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as ora from "ora";
import * as process from "process";
// import * as readline from "readline";
import * as url from "url";
import { NodeCodeLoader } from "./nodeCodeLoader";
import { NodeDocumentServiceFactory } from "./nodeDocumentServiceFactory";
import { NodePlatform } from "./nodePlatformFactory";

// tslint:disable:no-unsafe-any
// async function readlineAsync(input: readline.ReadLine, prompt: string): Promise<string> {
//     return new Promise<string>((resolve) => {
        // tslint:disable-next-line:no-unnecessary-callback-wrapper
//         input.question(prompt, (answer) => resolve(answer));
//     });
// }

function registerAttach(loader: Loader, container: Container, uri: string, platform: NodePlatform) {
    attach(loader, uri, platform);
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

async function attach(loader: Loader, docUrl: string, platform: NodePlatform) {
    const response = await loader.request({ url: docUrl });
    if (response.status !== 200) {
        return;
    }
    console.log(response.mimeType);
    if (response.mimeType === "prague/component") {
        const keyValueComponent = response.value as any;
        await keyValueComponent.attach(platform);
        keyValueComponent.root.set("something", "nothing");
        console.log("Done");
        // console.log("");
        // console.log("Enter message (ctrl+c to quit)");
        // console.log("");
        // console.log(runtime);
        /*
        const input = readline.createInterface(process.stdin, process.stdout);
        // tslint:disable-next-line:no-constant-condition
        while (true) {
            const message = await readlineAsync(input, "Message: ");
            runtime.submitMessage("op", {
                author: "Professor Node",
                content: message,
                language: "en",
                time: Date.now().toString(),
                translated: false,
              });
        }
        */
    }
}

async function run(loader: Loader, docUrl: string): Promise<void> {
    const loaderP = loader.resolve({ url: docUrl });
    ora.promise(loaderP, `Resolving...`);
    const container = await loaderP;
    const platform = new NodePlatform();
    registerAttach(loader, container, docUrl, platform);
}

// Process command line input
let action = false;
commander
    .option("-d, --orderer [orderer]", "Orderer URL", "https://alfred.wu2-ppe.prague.office-int.com")
    .option("-h, --storage [storage]", "Storage URL", "https://historian.wu2-ppe.prague.office-int.com")
    .option("-t, --tenant [tenant]", "Tenant", "prague")
    .option("-s, --secret [secret]", "Secret", "43cfc3fbf04a97c0921fd23ff10f9e4b")
    .arguments("<documentId>")
    .action((documentId) => {
        action = true;
        const jwtKey = "VBQyoGpEYrTn3XQPtXW3K8fFDd";
        const hostToken = jwt.sign(
            {
                user: "node-loader",
            },
            jwtKey);
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write",
                tenantId: commander.tenant,
                user: {id: "node-chatter"},
            },
            commander.secret);

        const documentUrl = `prague://${url.parse(commander.orderer).host}` +
            `/${encodeURIComponent(commander.tenant)}` +
            `/${encodeURIComponent(documentId)}`;

        const deltaStorageUrl = commander.orderer +
            `/deltas/${encodeURIComponent(commander.tenant)}/${encodeURIComponent(documentId)}`;

        const storageUrl =
            commander.storage +
            "/repos" +
            `/${encodeURIComponent(commander.tenant)}`;

        const resolved: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: commander.orderer,
                storageUrl,
            },
            tokens: { jwt: token },
            type: "prague",
            url: documentUrl,
        };

        const resolver = new ContainerUrlResolver(
            commander.orderer,
            hostToken,
            new Map([[documentUrl, resolved]]));

        const loader = new Loader(
            { resolver },
            new NodeDocumentServiceFactory(),
            new NodeCodeLoader(),
            null);

        run(loader, documentUrl)
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });

    })
    .parse(process.argv);

if (!action) {
    commander.help();
}
