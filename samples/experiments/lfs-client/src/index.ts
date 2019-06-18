/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as commander from "commander";
import * as fs from "fs";

commander
    .version("0.0.1")
    .option("-p, --print [print]", "Print hello world")
    .parse(process.argv);

if (commander.print) {
    console.log(__dirname);
    console.log("Hello World");
}

fs.readFile(__dirname + "/../lfs-object/cat.bin", (error, buffer) => {
    if (error) {
        console.log("Error");
        console.log(error);
    }
    if (buffer) {
        console.log("Buffer");
        handleLFS(buffer.toString());
    }
});


function handleLFS(file: string): ILfs {

    let lines = file.split('\n');

    let lfs: ILfs = <ILfs>{};
    lines.forEach(( value: string, index: number, array: string[]) => {
        if (value.startsWith("version")){
            lfs.version = value.split(" ")[1];
        } else if (value.startsWith("oid")) {
            lfs.oid = value.split(" ")[1];
        } else if (value.startsWith("size")) {
            lfs.size = +value.split(" ")[1];
        }
    });

    return lfs;
}

interface ILfs {
    oid: string;
    size: number;
    version: string;
}
