/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BuildPackage } from "../buildGraph";
import { ConcurrentNPMTask } from "./concurrentNpmTask";
import { LeafTask, UnknownLeafTask } from "./leaf/leafTask";
import { NPMTask } from "./npmTask";
import { Task } from "./task";
import { TscTask } from "./leaf/tscTask";
import { getExecutableFromCommand } from "../../common/utils";
import { EsLintTask, TsFormatTask, TsLintTask } from "./leaf/lintTasks";
import { ApiExtractorTask } from "./leaf/apiExtractorTask";
import { WebpackTask } from "./leaf/webpackTask";
import { LesscTask, CopyfilesTask, EchoTask, GenVerTask, TypeValidationTask } from "./leaf/miscTasks";
import { PrettierTask } from "./leaf/prettierTask";

// Map of executable name to LeafTasks
const executableToLeafTask: { [key: string]: new (node: BuildPackage, command: string) => LeafTask } = {
    tsc: TscTask,
    tslint: TsLintTask,
    eslint: EsLintTask,
    tsfmt: TsFormatTask,
    webpack: WebpackTask,
    "parallel-webpack": WebpackTask,
    lessc: LesscTask,
    copyfiles: CopyfilesTask,
    echo: EchoTask,
    prettier: PrettierTask,
    "gen-version": GenVerTask,
    "api-extractor": ApiExtractorTask,
    "fluid-type-validator": TypeValidationTask,
};

export class TaskFactory {
    public static Create(node: BuildPackage, command: string) {
        const concurrently = command.startsWith("concurrently ");

        if (concurrently) {
            const subTasks = new Array<Task>();
            const steps = command.substring("concurrently ".length).split(" ");
            for (const step of steps) {
                const stepT = step.trim();
                if (stepT.startsWith("npm:")) {
                    subTasks.push(TaskFactory.Create(node, "npm run " + stepT.substring("npm:".length)));
                } else {
                    subTasks.push(TaskFactory.Create(node, stepT));
                }
            }
            return new ConcurrentNPMTask(node, command, subTasks);
        }
        if (command.startsWith("npm run ")) {
            const subTasks = new Array<Task>();
            const script = node.pkg.getScript(command.substring("npm run ".length));
            if (script) {
                const steps = script.split("&&");
                for (const step of steps) {
                    subTasks.push(TaskFactory.Create(node, step.trim()));
                }
            }
            return new NPMTask(node, command, subTasks);
        }

        // Leaf task
        const executable = getExecutableFromCommand(command).toLowerCase();
        const ctor = executableToLeafTask[executable];
        if (ctor) {
            return new ctor(node, command);
        }
        return new UnknownLeafTask(node, command);
    }

    public static CreateScriptTasks(node: BuildPackage, scripts: string[]) {
        if (scripts.length === 0) { return undefined; }
        const tasks = scripts.map(value => TaskFactory.Create(node, `npm run ${value}`));
        return tasks.length == 1 ? tasks[0] : new NPMTask(node, `npm run ${scripts.map(name => `npm run ${name}`).join(" && ")}`, tasks);
    }
};
