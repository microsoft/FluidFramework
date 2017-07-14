import { exec } from "child_process";
import * as fs from "fs";

console.log("HELLO OUR TEST APP");

export async function runCommand(path: string, cmd: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        exec(cmd, {cwd: path}, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            }
            resolve(stdout);
        });
    });
}

export async function readFile(path: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        fs.readFile(path, "utf8", (error, data) => {
            if (error) {
                console.log(`Error reading file: ${error}`);
                reject(error);
            }
            resolve(data);
        });
    });
}
/*
setInterval(async () => {
    fs.readFile("../../../../app/ParameterCollection.json", "utf8", (error, data) => {
        if (error) {
            console.log(`Error reading file: ${error}`);
        }
    });
    await runCommand("../../../../app", "dotnet editorservicerelay.dll");

    console.log(`alive`);
}, 10000);*/
