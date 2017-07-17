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

export async function writeFile(path: string, text: string): Promise<any> {
    const textToWrite = JSON.stringify(constructJson(text));
    return new Promise<any>((resolve, reject) => {
        fs.writeFile(path, textToWrite, (error, data) => {
            if (error) {
                console.log(`Error writing file: ${error}`);
                reject(error);
            }
            resolve(data);
        });
    });
}

function constructJson(text: string) {
    return {
        Parameters: [
            {
                Name: "AppId",
                Present: "true",
                Value: "TestApp",
            },
            {
                Name: "AppVersion",
                Present: "false",
                Value: "1.0.0.0",
            },
            {
                Name: "RequestId",
                Present: "true",
                Value: "{B025D6F9-1C19-4207-A830-264A8CBC8BB1}",
            },
            {
                Name: "Text",
                Present: "true",
                Value: text,
            },
            {
                Name: "Start",
                Present: "false",
                Value: "0",
            },
            {
                Name: "Length",
                Present: "false",
                Value: text.length,
            },
            {
                Name: "LanguageId",
                Present: "true",
                Value: "en-us",
            },
            {
                Name: "LanguageUxId",
                Present: "false",
                Value: "en-us",
            },
            {
                Name: "RunOnProfileId",
                Present: "true",
                Value: "{24BCFF65-03B5-40E9-90C8-59B75ABD453C}",
            },
            {
                Name: "RunOnProfileGenerationId",
                Present: "false",
                Value: "0",
            },
        ],
    };
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
