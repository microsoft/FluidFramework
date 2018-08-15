import * as loader from "@prague/loader";
import { IDocumentService, ITokenService } from "@prague/runtime-definitions";
import * as driver from "@prague/socket-storage";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as process from "process";

// tslint:disable-next-line:no-var-requires
const packageDetails = require("../package.json");

async function run(
    token: string,
    options: any,
    documentServices: IDocumentService,
    tokenServices: ITokenService): Promise<void> {
    await loader.load(token, null, documentServices, tokenServices);
}

// Process command line input
commander
    .version(packageDetails.version)
    .option("-u, --deltas [deltas]", "Deltas URL", "http://localhost:3000")
    .option("-u, --snapshots [snapshots]", "Snapshots URL", "http://localhost:3001")
    .option("-u, --tenant [tenant]", "Tenant", "prague")
    .option("-u, --secret [secret]", "Secret", "43cfc3fbf04a97c0921fd23ff10f9e4b")
    .arguments("<documentId>")
    .action((documentId) => {
        const tokenServices = new driver.TokenService();
        const documentServices = driver.createDocumentService(commander.deltas, commander.snapshots);
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write",
                tenantId: commander.tenant,
                user: { id: "loader-client" },
            },
            commander.secret);

        run(token, null, documentServices, tokenServices).catch((error) => {
            console.error(error);
            process.exit(1);
        });
    })
    .parse(process.argv);
