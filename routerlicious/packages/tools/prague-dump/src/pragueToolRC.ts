import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as util from "util";

interface ITokens {
    accessToken: string;
    refreshToken: string;
}

interface IResources {
    tokens?: { [key: string]: ITokens };
}

function getRCFileName() {
    return path.join(os.homedir(), ".praguetoolrc");
}

export async function loadRC(): Promise<IResources> {
    const readFile = util.promisify(fs.readFile);
    const exists = util.promisify(fs.exists);
    const fileName = getRCFileName();
    if (await exists(fileName)) {
        const buf = await readFile(fileName);
        try {
            return JSON.parse(buf.toString("utf8"));
        } catch (e) {
            // Nothing
        }
    }
    return {};
}

export async function saveRC(rc: IResources) {
    const writeFile = util.promisify(fs.writeFile);
    const content = JSON.stringify(rc, undefined, 2);
    return writeFile(getRCFileName(), Buffer.from(content, "utf8"));
}
