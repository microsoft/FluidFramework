/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPlatform, IPragueResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { NodeCodeLoader, NodePlatform } from "@prague/services";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as ora from "ora";
import * as process from "process";
import * as readline from "readline";
import * as url from "url";

interface ITask {
    id: string;
    callback(): void;
}

interface IAgentScheduler {
    leader: boolean;
    register(...taskIds: string[]): Promise<void>;
    pick(...tasks: ITask[]): Promise<void>;
    release(...taskIds: string[]): Promise<void>;
    pickedTasks(): string[];
    on(event: "leader", listener: (...args: any[]) => void): this;
}

interface ISharedComponentWrapper {
    scheduler: IAgentScheduler;
    attach(platform: IPlatform): Promise<IPlatform>;
}

const t0: ITask = {
    callback: () => {
        console.log(`Running t0...`);
    },
    id: "t0",
};

const t1: ITask = {
    callback: () => {
        console.log(`Running t1...`);
    },
    id: "t1",
};
const t2: ITask = {
    callback: () => {
        console.log(`Running t2...`);
    },
    id: "t2",
};
const t3: ITask = {
    callback: () => {
        console.log(`Running t3...`);
    },
    id: "t3",
};
const t4: ITask = {
    callback: () => {
        console.log(`Running t4...`);
    },
    id: "t4",
};
const t5: ITask = {
    callback: () => {
        console.log(`Running t5...`);
    },
    id: "t5",
};
const t6: ITask = {
    callback: () => {
        console.log(`Running t6...`);
    },
    id: "t6",
};
const t7: ITask = {
    callback: () => {
        console.log(`Running t7...`);
    },
    id: "t7",
};
const t8: ITask = {
    callback: () => {
        console.log(`Running t8...`);
    },
    id: "t8",
};
const t9: ITask = {
    callback: () => {
        console.log(`Running t9...`);
    },
    id: "t9",
};
const t10: ITask = {
    callback: () => {
        console.log(`Running t10...`);
    },
    id: "t10",
};
const t11: ITask = {
    callback: () => {
        console.log(`Running t11...`);
    },
    id: "t11",
};
const t12: ITask = {
    callback: () => {
        console.log(`Running t12...`);
    },
    id: "t12",
};
const t13: ITask = {
    callback: () => {
        console.log(`Running t13...`);
    },
    id: "t13",
};
const t14: ITask = {
    callback: () => {
        console.log(`Running t14...`);
    },
    id: "t14",
};
const t15: ITask = {
    callback: () => {
        console.log(`Running t15...`);
    },
    id: "t15",
};
const tasks = [t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12, t13, t14, t15];

// tslint:disable:no-unsafe-any
async function readlineAsync(input: readline.ReadLine, prompt: string): Promise<string> {
    return new Promise<string>((resolve) => {
        // tslint:disable-next-line:no-unnecessary-callback-wrapper
        input.question(prompt, (answer) => resolve(answer));
    });
}

function registerAttach(loader: Loader, container: Container, uri: string, platform: NodePlatform) {
    attach(loader, uri, platform);
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

async function attach(loader: Loader, docUrl: string, platform: NodePlatform) {
    console.log(docUrl);
    const response = await loader.request({ url: docUrl });
    if (response.status !== 200) {
        return;
    }
    if (response.mimeType === "prague/component") {
        const schedulerComponent = response.value as ISharedComponentWrapper;
        await schedulerComponent.attach(platform);
        const taskScheduler = schedulerComponent.scheduler;

        taskScheduler.on("leader", () => {
            console.log(`Elected as leader`);
        });

        console.log("");
        console.log("Enter command (ctrl+c to quit)");
        console.log("");

        const input = readline.createInterface(process.stdin, process.stdout);
        // tslint:disable-next-line:no-constant-condition
        while (true) {
            const message = await readlineAsync(input, "Message: ");
            const parsed = message.split(":");
            const command = parsed[0];
            const id = Number(parsed[1]);
            if (command === "pick") {
                await taskScheduler.pick(tasks[id]).catch((err) => {
                    console.log(err);
                });
            } else if (command === "release") {
                await taskScheduler.release(tasks[id].id).catch((err) => {
                    console.log(err);
                });
            } else if (command === "register") {
                await taskScheduler.register(id.toString()).catch((err) => {
                    console.log(err);
                });
            } else {
                console.error(`Invalid command ${command}`);
            }
            console.log(`Current status: ${taskScheduler.pickedTasks()}`);
            if (taskScheduler.leader) {
                console.log(`Leader`);
            }

        }
    }
}

async function run(loader: Loader, docUrl: string, codePackage: string): Promise<void> {
    const loaderP = loader.resolve({ url: docUrl });
    ora.promise(loaderP, `Resolving...`);
    const container = await loaderP;
    const platform = new NodePlatform();
    registerAttach(loader, container, docUrl, platform);
    if (!container.existing) {
        await initializeChaincode(container, codePackage)
            .catch((error) => console.error("chaincode error", error));
    }
}

async function initializeChaincode(document: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }
    const quorum = document.getQuorum();
    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }
    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }
    console.log(`Code is ${quorum.get("code2")}`);
}

// Process command line input
let action = false;
commander
    .option("-d, --orderer [orderer]", "Orderer URL", "https://alfred.wu2-ppe.prague.office-int.com")
    .option("-h, --storage [storage]", "Storage URL", "https://historian.wu2-ppe.prague.office-int.com")
    .option("-t, --tenant [tenant]", "Tenant", "stupefied-kilby")
    .option("-s, --secret [secret]", "Secret", "4a9211594f7c3daebca3deb8d6115fe2")
    .option("-p, --package [package]", "Package", "@chaincode/agent-scheduler-test@0.3.16")
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
            new RouterliciousDocumentServiceFactory(),
            new NodeCodeLoader("https://packages.wu2.prague.office-int.com", "/tmp/chaincode", 60000),
            null);

        run(loader, documentUrl, commander.package)
            .catch((error) => {
                console.error(error);
                process.exit(1);
            });

    })
    .parse(process.argv);

if (!action) {
    commander.help();
}
