import * as localLoader from "@microsoft/fluid-local-web-host";
import { FluidSudoku } from "@fluid-example/sudoku";

localLoader.createLocalContainerFactory(FluidSudoku)
    .then((containerFactory) => {

        containerFactory()
            .then((container) => {
                localLoader.renderDefaultComponent(
                    container,
                    document.getElementById("content1"));
            });

        containerFactory()
            .then((container) => {
                localLoader.renderDefaultComponent(
                    container,
                    document.getElementById("content2"));
            });
    });

