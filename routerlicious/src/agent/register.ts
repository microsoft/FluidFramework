import * as $ from "jquery";
import { WorkerService } from "./workerService";

export function registerWorker(config: any, clientType: string) {
    if (!config.onlyServer) {
        const workerUrl =  config.url;
        const storageUrl = config.blobStorageUrl;
        const repository = config.repository;

        // Bootstrap service and connect. On failure, try to connect again.
        console.log(`Registering as worker`);
        const workerService = new WorkerService(
            document.location.origin,
            workerUrl,
            storageUrl,
            repository,
            config,
            clientType,
            initLoadModule(config),
        );
        let workerP = workerService.connect("Client");
        workerP.catch((error) => {
            console.log(`Error connecting to worker`);
            workerP = workerService.connect("Client");
        });
    }
}

/*
let loaded = ( () => {
    return {
        factory: null,
    };
})();

function load(file, callback) {
    $.getScript(file, callback);
}*/

function initLoadModule(config: any): (name: string) => Promise<any> {
    return (scriptName: string) => {
        return new Promise<any>((resolve, reject) => {
            console.log(`Script name: ${scriptName}`);
            const scriptUrl = `${config.scriptUrl}${scriptName}`;
            console.log(`Script url: ${scriptUrl}`);

            /*
            load(scriptUrl, () => {
                let service = loaded.factory.create(config.intelligence.resume);
                console.log(service);
                console.log(service.run("dummy text"));
            });*/

            $.getScript(scriptUrl, (data, textStatus, jqxhr) => {
                console.log(data);
                console.log(textStatus);
                console.log(jqxhr.status);
                console.log("Load was performed.");

                /*
                const m1 = "ResumeAnalyticsFactory";
                const m2 = "factory";
                import(m1).then((loadedModule) => {
                    console.log(`${loadedModule}`);
                }, (err) => {
                    console.log(`Error importing ${scriptName}: ${err}`);
                });
                import(m2).then((loadedModule) => {
                    console.log(`${loadedModule}`);
                }, (err) => {
                    console.log(`Error importing ${scriptName}: ${err}`);
                });*/

                reject("Fake loading!!!");
              });
        });
    };
}
