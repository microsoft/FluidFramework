import * as resume from "../intelligence/resume";

const intelligent = resume.factory.create();
const resultP = intelligent.run("Hello, world!");

resultP.then(
    (response) => {
        console.log(response);
    },
    (error) => {
        console.error(error);
    });
