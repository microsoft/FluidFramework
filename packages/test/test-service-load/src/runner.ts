/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { Container } from "@fluidframework/container-loader";
import { IRunConfig } from "./loadTestDataStore";
import { createTestDriver, getProfile, load, loggerP, safeExit } from "./utils";
import { FaultInjectionDocumentServiceFactory } from "./faultInjectionDriver";

function printStatus(runConfig: IRunConfig, message: string) {
    if(runConfig.verbose) {
        console.log(`${runConfig.runId.toString().padStart(3)}> ${message}`);
    }else{
        process.stdout.write(".");
    }
}

function printProgress(runConfig: IRunConfig) {
    if(!runConfig.verbose) {
        process.stdout.write(".");
    }
}

async function main() {
    commander
        .version("0.0.1")
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-p, --profile <profile>", "Which test profile to use from testConfig.json", "ci")
        .requiredOption("-u --url <url>", "Load an existing data store from the url")
        .requiredOption("-r, --runId <runId>", "run a child process with the given id. Requires --url option.")
        .option("-l, --log <filter>", "Filter debug logging. If not provided, uses DEBUG env variable.")
        .option("-v, --verbose", "Enables verbose logging")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const profileArg: string = commander.profile;
    const url: string = commander.url;
    const runId: number  = commander.runId;
    const log: string | undefined = commander.log;
    const verbose: boolean = commander.verbose ?? false;

    const profile = getProfile(profileArg);

    if (log !== undefined) {
        process.env.DEBUG = log;
    }

    if (url === undefined) {
        console.error("Missing --url argument needed to run child process");
        process.exit(-1);
    }
    const result = await runnerProcess(
        driver,
        {
            runId,
            testConfig: profile,
            verbose,
        },
        url);

    await safeExit(result, url, runId);
}

/**
 * Implementation of the runner process. Returns the return code to exit the process with.
 */
async function runnerProcess(
    driver: TestDriverTypes,
    runConfig: IRunConfig,
    url: string,
): Promise<number> {
    try {
        const testDriver = await createTestDriver(driver, runConfig.runId);

        let reset = true;
        let done = false;
        const documentServiceFactoryReused =
            new FaultInjectionDocumentServiceFactory(testDriver.createDocumentServiceFactory());
        let counter = 0;

        while(!done) {
            counter++;
            // Switch between creating new factory vs. reusing factory.
            // Certain behavior (like driver caches) are per factory instance, and by reusing it we hit those code paths
            // At the same time we want to test newly created factory.
            const factory = counter % 1 === 0 ?
                documentServiceFactoryReused :
                new FaultInjectionDocumentServiceFactory(testDriver.createDocumentServiceFactory());

            const {container, test} = await load(testDriver, factory, url, runConfig.runId);
            scheduleContainerClose(container, runConfig);
            scheduleFaultInjection(factory, container, runConfig);
            try{
                printProgress(runConfig);
                printStatus(runConfig, `running`);
                done = await test.run(runConfig, reset);
                printStatus(runConfig, done ?  `finished` : "closed");
            }catch(error) {
                await loggerP.then(
                    async (l)=>l.sendErrorEvent({eventName: "RunnerFailed", runId: runConfig.runId}, error));
                throw error;
            }
            finally {
                reset = false;
                if(!container.closed) {
                    container.close();
                }
                await loggerP.then(async (l)=>l.flush({url, runId: runConfig.runId}));
            }
        }
        return 0;
    } catch (e) {
        printStatus(runConfig, `error: loading test`);
        console.error(e);
        return -1;
    }
}

function scheduleFaultInjection(
    ds: FaultInjectionDocumentServiceFactory,
    container: Container,
    runConfig: IRunConfig) {
    const schedule = ()=>{
        const injectionTime = runConfig.testConfig.readWriteCycleMs * 5 * Math.random();
        printStatus(runConfig, `fault injection in ${(injectionTime / 60000).toString().substring(0,4)} min`);
        setTimeout(() => {
            if(container.connected && container.resolvedUrl !== undefined) {
                const deltaConn =
                    ds.documentServices.get(container.resolvedUrl)?.documentDeltaConnection;
                if(deltaConn !== undefined) {
                    // 1 in numClients chance of non-retritable error to not overly conflict with container close
                    const canRetry = Math.floor(Math.random() * runConfig.testConfig.numClients) === 0 ? false : true;
                    switch(Math.floor(Math.random() * 5)) {
                        // dispreferr errors
                        case 0: {
                            deltaConn.injectError(canRetry);
                            printStatus(runConfig, `error injected canRetry:${canRetry}`);
                            break;
                        }
                        case 1:
                        case 2: {
                            deltaConn.injectDisconnect();
                            printStatus(runConfig, "disconnect injected");
                            break;
                        }
                        case 3:
                        case 4:
                        default: {
                            deltaConn.injectNack(container.id, canRetry);
                            printStatus(runConfig, `nack injected canRetry:${canRetry}`);
                            break;
                        }
                    }
                }
            }
            if(!container.closed) {
                schedule();
            }
        }, injectionTime);
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
                    printStatus(runConfig, `closing in ${(leaveTime / 60000).toString().substring(0,4)} min`);
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
