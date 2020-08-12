import React from "react";

// import { MemberList } from "./MemberList";
// import { FluidEditor } from "./FluidEditor";

// import { FluidDraftJs } from "./FluidDraftJs";

// interface IAppProps {
//     model: FluidDraftJs;
// }

/**
 * The entirety of the View logic is encapsulated within the App.
 * The App uses the provided model to interact with Fluid.
 */
export const FluidDraftJsView: React.FC = (props) => {
    // const [diceValue, setDiceValue] = React.useState(props.model.value);

    // // Setup a listener that
    // React.useEffect(() => {
    //     const onDiceRolled = () => {
    //         const newValue = props.model.value;
    //         setDiceValue(newValue);
    //     };
    //     props.model.on("diceRolled", onDiceRolled);
    //     return () => {
    //         // When the view dismounts remove the listener to avoid memory leaks
    //         props.model.off("diceRolled", onDiceRolled);
    //     };
    // }, [diceValue]);

    // // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    // const diceChar = String.fromCodePoint(0x267F + diceValue);
    // const diceColor = `hsl(${diceValue * 60}, 70%, 50%)`;

    // // Set the Tab Title to the dice char because it's cool,
    // // and it makes testing with multiple tabs easier
    // document.title = `${diceChar} - ${props.model.id}`;

    return (
        <div style={{ margin: "20px auto", maxWidth: 800 }}>
            {/* <MemberList quorum={this.runtime.getQuorum()} dds={this.authors} style={{ textAlign: "right" }} />
            <FluidEditor sharedString={this.text} authors={this.authors} runtime={this.runtime} /> */}
            Hello World
        </div>
    );
};
