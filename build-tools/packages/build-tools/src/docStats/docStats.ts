/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import fs from "fs";
import path from "path"


interface Record {
    name: string,
    total: number,
    docTotal: number,
    percent: number,
}

async function main() {
    const dir = process.argv[2];
    if (!dir) {
        console.error("ERROR: Missing path argument");
        return;
    }
    const files = fs.readdirSync(dir, { withFileTypes: true });
    const record: Record[] = [];
    files.filter((dirent) => dirent.isFile).forEach((file) => {
        if (!file.name.endsWith(".json")) { 
            return;
        }
        let fileTotal = 0;
        let fileDocTotal = 0;
        const processMembers = (member: any) => {
            switch (member.kind) {
                case "Package":
                case "Class":
                case "Interface":
                case "Enum":
                case "Namespace":
                case "Constructor":
                case "Method":
                case "ConstructSignature":
                case "IndexSignature":
                case "PropertySignature":
                case "MethodSignature":
                case "Function":
                case "Variable":
                case "Property":
                case "CallSignature":
                case "TypeAlias":
                case "EnumMember":
                    fileTotal++;
                    if (member.docComment !== "") {
                        fileDocTotal++;
                    }
                    break;
                case "EntryPoint":
                    break;
                default:
                    console.log(`Unknown kind ${member.kind}`);
                    break;
            }
            if (member.members) {
                for (const nested of member.members) {
                    processMembers(nested);
                }
            }
        }

        try {
            const content = JSON.parse(fs.readFileSync(path.join(dir, file.name), "utf-8"));
            processMembers(content);
            record.push({
                name: file.name,
                total: fileTotal,
                docTotal: fileDocTotal,
                percent: fileDocTotal / fileTotal * 100
            })
        } catch {
            console.error(`ERROR: failed to parse ${file.name}`);
        }
    });

    const print = (rec: Record) => {
        console.log(`${rec.name.padStart(50)}: ` +
            `${rec.docTotal.toString().padStart(4)}/${rec.total.toString().padStart(4)} ` +
            `${rec.percent.toFixed(2).padStart(6)}%`);
    }
    let total = 0;
    let docTotal = 0;
    record.sort((a, b) => b.percent - a.percent).forEach(rec => {
        total += rec.total;
        docTotal += rec.docTotal
        print(rec);
    });

    console.log("=".repeat(80));

    print({ name: "Total", total, docTotal, percent: docTotal / total * 100});

}

main().catch(e => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});
