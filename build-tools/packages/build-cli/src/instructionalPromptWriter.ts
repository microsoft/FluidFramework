/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StringBuilder } from "@rushstack/node-core-library";
import chalk from "chalk";
import { indentString } from "./lib";
import { CommandLogger } from "./logging";

/**
 * An instructional prompt to display to a user in a terminal. A prompt can have any number of sections, and each
 * section is meant to be shown sequentially to provide step-by-step instructions.
 */
export interface InstructionalPrompt {
    /** The title of the prompt. */
    title: string;

    /** An array of sections that comprise the prompt. */
    sections: Section[];
}

interface Section {
    /** The title of the section. */
    title: string;

    /** The instructional message to be displayed in the section. */
    message: string;

    /** An optional command string that will be displayed with the instructions. */
    cmd?: string;
}

export abstract class InstructionalPromptWriter {
    protected abstract get log(): CommandLogger;

    public async formatPrompt(data: InstructionalPrompt): Promise<string> {
        const b = new StringBuilder();

        b.append(chalk.green(chalk.underline(data.title)));
        b.append("\n");
        b.append("\n");

        for (const section of data.sections) {
            b.append(chalk.white(chalk.underline(`${section.title}:`)));
            b.append("\n");
            b.append("\n");
            b.append(indentString(section.message, 4));
            b.append("\n");
            b.append("\n");
            if (section.cmd !== undefined) {
                b.append(indentString(chalk.cyan(`${section.cmd}`), 4));
                b.append("\n");
                b.append("\n");
            }
        }

        return b.toString();
    }

    public async writePrompt(data: InstructionalPrompt) {
        const prompt = await this.formatPrompt(data);

        this.log.logHr();
        this.log.info("");
        this.log.info(prompt);
    }
}

export class PromptWriter extends InstructionalPromptWriter {
    public constructor(public log: CommandLogger) {
        super();
    }
}
