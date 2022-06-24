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
import { ScriptDependencies } from "../../common/npmPackage";
import { getExecutableFromCommand } from "../../common/utils";
import { EsLintTask, TsFormatTask, TsLintTask } from "./leaf/lintTasks";
import { ApiExtractorTask } from "./leaf/apiExtractorTask";
import { WebpackTask } from "./leaf/webpackTask";
import { LesscTask, CopyfilesTask, EchoTask, GenVerTask, TypeValidationTask } from "./leaf/miscTasks";
import { PrettierTask } from "./leaf/prettierTask";

function mergeScriptDependencies(oldDeps: ScriptDependencies, newDeps?: ScriptDependencies) {
    if (!newDeps) { return oldDeps; }
    const mergedScriptDeps = { ...oldDeps };
    for (const pkg of Object.keys(newDeps)) {
        const oldValues = mergedScriptDeps[pkg];
        const newValues = newDeps[pkg];
        mergedScriptDeps[pkg] = oldValues ? oldValues.concat(newValues) : newValues;
    }
    return mergedScriptDeps;
}

// Map of executable name to LeafTasks
const executableToLeafTask: { [key: string]: new (node: BuildPackage, command: string, scriptDeps: ScriptDependencies) => LeafTask } = {
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
    private static Create(node: BuildPackage, command: string, scriptDeps: ScriptDependencies) {
        const concurrently = command.startsWith("concurrently ");
        if (concurrently) {
            const subTasks = new Array<Task>();
            const steps = command.substring("concurrently ".length).split(" ");
            for (const step of steps) {
                const stepT = step.trim();
                if (stepT.startsWith("npm:")) {
                    subTasks.push(TaskFactory.Create(node, "npm run " + stepT.substring("npm:".length), scriptDeps));
                } else {
                    subTasks.push(TaskFactory.Create(node, stepT, scriptDeps));
                }
            }
            return new ConcurrentNPMTask(node, command, subTasks);
        }
        if (command.startsWith("npm run ")) {
            const subTasks = new Array<Task>();
            const scriptName = command.substring("npm run ".length);
            const script = node.pkg.getScript(scriptName);
            if (script) {
                const mergeDeps = node.pkg.packageJson.fluidBuild?.buildDependencies?.merge?.[scriptName];
                const newScriptDeps = mergeScriptDependencies(scriptDeps, mergeDeps);
                const steps = script.split("&&");
                for (const step of steps) {
                    subTasks.push(TaskFactory.Create(node, step.trim(), newScriptDeps));
                }
            }
            return new NPMTask(node, command, subTasks);
        }

        // Leaf task
        const executable = getExecutableFromCommand(command).toLowerCase();
        const ctor = executableToLeafTask[executable];
        if (ctor) {
            return new ctor(node, command, scriptDeps);
        }
        return new UnknownLeafTask(node, command, scriptDeps);
    }

    public static CreateScriptTasks(node: BuildPackage, scripts: string[]) {
        if (scripts.length === 0) { return undefined; }
        const tasks = scripts.map(value => TaskFactory.Create(node, `npm run ${value}`, {}));
        return tasks.length == 1 ? tasks[0] : new NPMTask(node, `npm run ${scripts.map(name => `npm run ${name}`).join(" && ")}`, tasks);
    }
}
