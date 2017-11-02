import * as resume from "../intelligence/resume";

const intelligent = resume.factory.create({
    deviceId: "routerlicious",
    host: "pkarimov-paidIOT.azure-devices.net",
    sharedAccessKey: "8mvOmNnUklwnuzY+U96V51w+qCq262ZUpSkdw8nTZ18=",
    sharedAccessKeyName: "iothubowner",
});
const resultP = intelligent.run("Hello, world!");

resultP.then(
    (response) => {
        console.log(response);
    },
    (error) => {
        console.error(error);
    });
