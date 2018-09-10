import * as MergeTree from "@prague/merge-tree";
import * as request from "request";
import * as url from "url";

export async function loadDictionary(serverUrl: string): Promise<MergeTree.TST<number>> {
    const dict = new MergeTree.TST<number>();
    return new Promise<MergeTree.TST<number>>((resolve, reject) => {
        downloadRawText(serverUrl, "/public/literature/dictfreq.txt").then((text: string) => {
            const splitContent = text.split("\n");
            for (const entry of splitContent) {
                const splitEntry = entry.split(";");
                dict.put(splitEntry[0], parseInt(splitEntry[1], 10));
            }
            console.log(`Loaded dictionary`);
            resolve(dict);
        }, (err) => {
            console.log(err);
            reject(err);
        });
    });
}

async function downloadRawText(serverUrl: string, textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(serverUrl, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}
