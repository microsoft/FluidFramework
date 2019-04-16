import chalk from "chalk";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as request from "request";

request.defaults({ encoding: null });


interface IBlobData {
    content: string;
    metadata: any;
};

function download(uri: string, tenantId: string, documentId: string, token: string){
    request.get(uri, (error, response, body) => {
        if (!error && response.statusCode == 200) {
            // const data = "data:" + response.headers["content-type"] + ";base64," + new Buffer(body).toString('base64');
            // console.log(data);
            const contentBuffer = new Buffer(body);
            const content = contentBuffer.toString("base64")
            const metadata = {
                content: null,
                fileName: "does_not_matter.png",
                height: 400,
                sha: "does_not_matter",
                size: contentBuffer.byteLength,
                type: "image",
                url: "does_not_matter",
                width: 400,
            };

            const uploadData: IBlobData = {
                content,
                metadata,
            };

            request(
                {
                    body: uploadData,
                    headers: {
                        "Content-Type": "application/json",
                        "access-token": token,
                    },
                    json: true,
                    method: "POST",
                    uri: `http://localhost:3003/api/v1/${tenantId}/${documentId}/blobs`,
                },
                (err, resp, body) => {
                    if (err || resp.statusCode !== 200) {
                        console.log(err);
                    } else {
                        console.log(JSON.stringify(body));
                    }
            });
        }
    });
  };

function generateToken(tenantId: string, documentId: string): string {
    action = true;
    const user = { id: "rest-client" };
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write",
            tenantId,
            user,
        },
        commander.secret);
    return token;
}


let action = false;
commander
    .option("-t, --tenant [tenant]", "Tenant", "stupefied-kilby")
    .option("-s, --secret [secret]", "Secret", "4a9211594f7c3daebca3deb8d6115fe2")
    .arguments("<documentId>")
    .action((documentId) => {
        const token = generateToken(commander.tenant, documentId);
        console.log(chalk.green(`${token}`));
        download("https://www.google.com/images/srpr/logo3w.png", commander.tenant, documentId, token);
    })
    .parse(process.argv);

if (!action) {
    commander.help();
}