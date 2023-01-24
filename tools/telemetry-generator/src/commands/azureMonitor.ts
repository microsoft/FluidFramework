/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import { Command, Flags } from "@oclif/core";
// import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import * as appInsight from 'applicationinsights';

export class EntryPoint extends Command {
    static flags = {
        help: Flags.help(),
        handlerModule: Flags.string({
            char: "m",
            required: true,
            description: "Absolute path to a JavaScript file that exports a handler function to process the files " +
                "contained in the folders specified with --dir.",
        }),
        dir: Flags.string({
            char: "d",
            multiple: true,
            required: true,
            description: "Folder that contain the test output files to process. " +
                "Files in subfolders are also processed. Can be specified multiple times.",
        }),
        connectionString: Flags.string({
            char: "c",
            required: true,
            description: "The connection string to initialize the azure telemetry client with",
        }),
    };

    static examples = [
        {
            command: "$ node bin/run --handlerModule /path/to/my/module.js --dir /path/to/my/files",
            description: "Process files from /path/to/my/files and all its subfolders, using the handler at " +
                "/path/to/my/module.js",
        },
    ];

    async run() {
        const { flags } = await this.parse(EntryPoint);

        let handler;
        try {
            // Note: we expect the path to the handler module to be absolute. Relative paths technically work, but
            // one needs to be very familiar with Node's module resolution strategy and understand exactly which file
            // is the one getting executed at runtime (since that's where the relative path will be resolved from).
            handler = (await import(flags.handlerModule)).default;
        } catch (err) {
            exitWithError(`Unexpected error importing specified handler module.\n${err}`);
        }

        if (typeof handler !== "function") {
            exitWithError("Handler module does not have a function as its default export");
        }

        console.log(`obtained connection string: ${flags.connectionString}`)

        appInsight.setup(flags.connectionString)
        .start();
        const logger = appInsight.defaultClient;

        // const appInsights = new ApplicationInsights({
        //     config: {
        //         connectionString: flags.connectionString
        //     }
        // })
        // const logger = appInsights.defaultClient;

        const dirs = [...flags.dir]
        const filesToProcess: string[] = [];

        while (dirs.length > 0) {
            const dir: string = dirs.pop()!;
            const stat = fs.statSync(dir);
            if (stat.isDirectory()) {
                const dirEnts = fs.readdirSync(dir, { withFileTypes: true });
                dirEnts.forEach((dirent) => {
                    const direntFullPath = path.join(dir, dirent.name);
                    if (dirent.isDirectory()) {
                        dirs.push(direntFullPath);
                        return;
                    }
                    // We expect the files to be processed to be .json files. Ignore everything else.
                    if (!dirent.name.endsWith(".json")) {
                        return;
                    }
                    filesToProcess.push(direntFullPath);
                });
            } else if (stat.isFile()) {
                filesToProcess.push(dir);
            } else {
                exitWithError(`Could not handle path '${dir}'. It is neither a file nor a folder.`);
            }
        }

        filesToProcess.forEach((fullPath) => {
            try {
                console.log(`Processing file '${fullPath}'`);
                const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
                handler(data, logger);
            } catch (err: any) {
                console.error(`Unexpected error processing file '${fullPath}'.\n${err.stack}`);
            }
        });

        // await logger.flush();
    }
}

function exitWithError(errorMessage: string) {
    console.error(errorMessage);
    process.exit(1);
}
