import * as loader from "@prague/loader";
import { IMap } from "@prague/map";
import {
    IChaincodeFactory,
    ICodeLoader,
    IDocumentService,
    IPlatform,
    IPlatformFactory,
    ITokenProvider,
    IUser,
} from "@prague/runtime-definitions";
import * as driver from "@prague/socket-storage";
import chalk from "chalk";
import { exec } from "child_process";
import * as commander from "commander";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import * as ora from "ora";
import * as path from "path";
import * as process from "process";
import * as readline from "readline";
import { promisify } from "util";

const asyncExec = promisify(exec);

const npmRegistry = "https://packages.wu2.prague.office-int.com";

const rootMapId = "root";

class NodeCodeLoader implements ICodeLoader {
    public async load(pkg: string): Promise<IChaincodeFactory> {
        const components = pkg.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }
        const [, scope, name] = components;

        const packagesBase = path.join(__dirname, "../packages");
        console.log(`Loading package...`);
        await asyncExec(`npm install ${pkg} --registry ${npmRegistry}`, { cwd: packagesBase });

        // tslint:disable:no-unsafe-any
        // tslint:disable-next-line:non-literal-require
        const entry = import(`${packagesBase}/node_modules/${scope}/${name}`);
        return entry;
    }
}

class NodePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }
}

class NodePlatformFactory implements IPlatformFactory {
    public async create(): Promise<IPlatform> {
        return new NodePlatform();
    }
}

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
    options: any,
    reject: boolean,
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

    const runtime  = document.runtime;
    console.log(runtime.existing);
    const quorum = runtime.getQuorum();
    quorum.on("addMember", (clientId, details) => console.log(`${clientId} : ${details} joined`));
    quorum.on("removeMember", (clientId) => console.log(`${clientId} left`));
    /*
    setTimeout(async () => {
        console.log(`Timed`);
    }, 20000);*/

    document.on("runtimeChanged", async (newRuntime) => {
        console.log(`New runtime: ${newRuntime.tenantId}`);
        const root = await newRuntime.getChannel(rootMapId) as IMap;
        console.log(`Root loaded!`);
        const rootView = await root.getView();
        console.log(rootView.keys());

        console.log("");
        console.log("Enter increment amount (ctrl+c to quit)");
        console.log("");

        const input = readline.createInterface(process.stdin, process.stdout);
        // tslint:disable-next-line:no-constant-condition
        while (true) {
            const value = await readlineAsync(input, chalk.green("Value: "));

            // Accept both raw strings and JSON input
            let parsedValue: number;
            try {
                parsedValue = Number(value);
                console.log(parsedValue);
                // tslint:disable-next-line
                const clicks = rootView.get("clicks");
                // tslint:disable-next-line
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
    .option("-r, --reject", "Reject")
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
            null,
            commander.reject,
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
