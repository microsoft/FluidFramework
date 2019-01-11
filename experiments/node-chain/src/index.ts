import * as loader from "@prague/loader";
import { IMap } from "@prague/map";
import {
    IDocumentService,
    ITokenProvider,
    IUser,
} from "@prague/runtime-definitions";
import * as driver from "@prague/socket-storage";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as ora from "ora";
import * as process from "process";
import * as readline from "readline";
import { NodeCodeLoader } from "./nodeCodeLoader";
import { NodePlatformFactory } from "./nodePlatformFactory";

const rootMapId = "root";

// tslint:disable:no-unsafe-any

async function readlineAsync(input: readline.ReadLine, prompt: string): Promise<string> {
    return new Promise<string>((resolve) => {
        // tslint:disable-next-line:no-unnecessary-callback-wrapper
        input.question(prompt, (answer) => resolve(answer));
    });
}

async function run(
    id: string,
    tenantId: string,
    user: IUser,
    tokenProvider: ITokenProvider,
    documentServices: IDocumentService): Promise<void> {
    const platformFactory = new NodePlatformFactory();
    const documentP = loader.load(
        id,
        tenantId,
        user,
        tokenProvider,
        null,
        platformFactory,
        documentServices,
        new NodeCodeLoader());
    ora.promise(documentP, `Loading ${tenantId}/${id}`);
    const document = await documentP;

    document.on("runtimeChanged", async (newRuntime) => {
        const root = await newRuntime.getChannel(rootMapId) as IMap;
        const rootView = await root.getView();

        console.log("");
        console.log("Enter increment amount (ctrl+c to quit)");
        console.log("");

        const input = readline.createInterface(process.stdin, process.stdout);
        // tslint:disable-next-line:no-constant-condition
        while (true) {
            const value = await readlineAsync(input, "Value: ");

            // Only accepts number as input.
            let parsedValue: number;
            try {
                parsedValue = Number(value);
                // tslint:disable no-backbone-get-set-outside-model
                const clicks = Number(rootView.get("clicks"));
                rootView.set("clicks", clicks + parsedValue);
            } catch {
                console.log(`Only integer value is allowed`);
            }
        }
    });
}

// Process command line input
let action = false;
commander
    .option("-d, --deltas [deltas]", "Deltas URL", "https://alfred.wu2.prague.office-int.com")
    .option("-h, --snapshots [snapshots]", "Snapshots URL", "https://historian.wu2.prague.office-int.com")
    .option("-t, --tenant [tenant]", "Tenant", "happy-chatterjee")
    .option("-s, --secret [secret]", "Secret", "8f69768d16e3852bc4b938cdaa0577d1")
    .arguments("<documentId>")
    .action((documentId) => {
        action = true;
        const documentServices = driver.createDocumentService(commander.deltas, commander.snapshots);
        const user = { id: "loader-client" };
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write",
                tenantId: commander.tenant,
                user,
            },
            commander.secret);

        run(
            documentId,
            commander.tenant,
            user,
            new driver.TokenProvider(token),
            documentServices)
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });
    })
    .parse(process.argv);

if (!action) {
    commander.help();
}
