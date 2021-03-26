/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { Container } from "@fluidframework/container-loader";

import { ILoadTestConfig } from "./testConfigFile";
import { IRunConfig } from "./loadTestDataStore";
import { createTestDriver, getProfile, load, loggerP, safeExit } from "./utils";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";

function printStatus(runId: number, message: string) {
    console.log(`${runId.toString().padStart(3)}> ${message}`);
}

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .requiredOption("-u --url <url>", "Load an existing data store from the url")
        .requiredOption("-r, --runId <runId>", "run a child process with the given id. Requires --url option.")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const profileArg: string = commander.profile;
    const url: string = commander.url;
    const runId: number  = commander.runId;
    const log: string | undefined = commander.log;

    const profile = getProfile(profileArg);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    if (url === undefined) {
        console.error("Missing --url argument needed to run child process");
        process.exit(-1);
    }
    const result = await runnerProcess(driver, profile, runId, url);

    await safeExit(result, url, runId);
}

/**
 * Implementation of the runner process. Returns the return code to exit the process with.
 */
async function runnerProcess(
    driver: TestDriverTypes,
    profile: ILoadTestConfig,
    runId: number,
    url: string,
): Promise<number> {
    try {
        const runConfig: IRunConfig = {
            runId,
            testConfig: profile,
        };

        const testDriver = await createTestDriver(driver);

        let reset = true;
        let done = false;
        while(!done) {
            const {documentServiceFactory, container, test} = await load(testDriver, url, runId);
            scheduleContainerClose(container, runConfig);
            scheduleNackAndDisconnect(documentServiceFactory, container, runConfig);
            try{
                printStatus(runId, `running`);
                done = await test.run(runConfig, reset);
                printStatus(runId, done ?  `finished` : "closed");
            }catch(error) {
                await loggerP.then(
                    async (l)=>l.sendErrorEvent({eventName: "RunnerFailed", runId: runConfig.runId}, error));
                throw error;
            }
            finally{
                reset = false;
                if(!container.closed) {
                    container.close();
                }
                await loggerP.then(async (l)=>l.flush({url, runId}));
            }
        }
        return 0;
    } catch (e) {
        printStatus(runId, `error: loading test`);
        console.error(e);
        return -1;
    }
}

function scheduleNackAndDisconnect(
    ds: FaultInjectionDocumentServiceFactory,
    container: Container,
    runConfig: IRunConfig) {
    const schedule = ()=>{
        const leaveTime = runConfig.testConfig.readWriteCycleMs * 5 * Math.random();
        printStatus(runConfig.runId, `fault injection in ${(leaveTime / 60000).toString().substring(0,4)} min`);
        setTimeout(() => {
            if(container.connected && container.resolvedUrl !== undefined) {
                const deltaConn =
                    ds.documentServices.get(container.resolvedUrl)?.documentDeltaConnection;
                if(deltaConn !== undefined) {
                    switch(Math.floor(Math.random() * 5)) {
                        // dispreferr errors
                        case 0: {
                            // 1 in 10 chance of non-retritable error
                            const canRetry = Math.floor(Math.random() * 10) === 0 ? false : true;
                            deltaConn.injectError(canRetry);
                            printStatus(runConfig.runId, `error injected canRetry:${canRetry}`);
                            break;
                        }
                        case 1:
                        case 2: {
                            deltaConn.injectDisconnect();
                            printStatus(runConfig.runId, "disconnect injected");
                            break;
                        }
                        case 3:
                        case 4:
                        default: {
                            deltaConn.injectNack(container.id);
                            printStatus(runConfig.runId, "nack injected");
                            break;
                        }
                    }
                }
            }
            if(!container.closed) {
                schedule();
            }
        }, leaveTime);
    };
    schedule();
}

function scheduleContainerClose(container: Container, runConfig: IRunConfig) {
    new Promise<void>((res)=>{
        // wait for the container to connect write
        container.once("closed", res);
        if(!container.deltaManager.active) {
            container.once("connected", ()=>{
                res();
                container.off("closed", res);
            });
        }
    }).then(()=>{
        if(container.closed) {
            return;
        }
        const quorum = container.getQuorum();
        const scheduleLeave = ()=>{
            const clientId = container.clientId;
            if(clientId !== undefined && quorum.getMembers().has(clientId)) {
                // calculate the clients quorum position
                const quorumIndex = [... quorum.getMembers().entries()]
                    .sort((a,b)=>b[1].sequenceNumber - a[1].sequenceNumber)
                    .map((m)=>m[0])
                    .indexOf(clientId);

                // only the oldest quarter of active clients are scheduled to leave this time.
                // this will bias toward the summarizer client which is always quorum index 0.
                if(quorumIndex >= 0 && quorumIndex <= runConfig.testConfig.numClients / 4) {
                    quorum.off("removeMember",scheduleLeave);
                    const leaveTime = runConfig.testConfig.readWriteCycleMs * 5 * Math.random();
                    printStatus(runConfig.runId, `closing in ${(leaveTime / 60000).toString().substring(0,4)} min`);
                    setTimeout(
                        ()=>{
                            if(!container.closed) {
                                container.close();
                            }
                        },
                        leaveTime);
                }
            }
        };
        quorum.on("removeMember", scheduleLeave);
        scheduleLeave();
    }).catch(async (e)=>{
        await loggerP.then(async (l)=>l.sendErrorEvent({eventName: "ScheduleLeaveFailed", runId: runConfig.runId}, e));
    });
}

main()
.catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
