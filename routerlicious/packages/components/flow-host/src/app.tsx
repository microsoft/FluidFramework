import { IComponentRuntime } from "@prague/runtime-definitions";
import { initializeIcons } from "@uifabric/icons";
import { CommandBar, ICommandBarItemProps } from "office-ui-fabric-react/lib/CommandBar";
import * as React from "react";
import { ChaincodeDialog } from "./chaincodedialog";
import { FlowEditor } from "./editor";
import * as style from "./index.css";
import * as styles from "./index.css";

export interface IAppConfig {
    runtime: IComponentRuntime;
    verdaccioUrl: string;           // Url of Verdaccio npm server (e.g., "http://localhost:4873")
}

interface IProps {
    config: IAppConfig;
}

interface IState {
    virtualize: boolean;
}

export class App extends React.Component<IProps, IState> {

    private static readonly exampleText = [
        "The SID is a mixed-signal integrated circuit, featuring both digital and analog circuitry. All control ports are digital, while the output ports are analog. The SID features three-voice synthesis, where each voice may use one of at least five different waveforms: pulse wave (with variable duty cycle), triangle wave, sawtooth wave, pseudorandom noise (called white noise in documentation), and certain complex/combined waveforms when multiple waveforms are selected simultaneously. A voice playing Triangle waveform may be ring-modulated with one of the other voices, where the triangle waveform's bits are inverted when the modulating voice's msb is set, producing a discontinuity and change of direction with the Triangle's ramp. Oscillators may also be hard-synced to each other, where the synced oscillator is reset whenever the syncing oscillator's msb raises.",
        "Each voice may be routed into a common, digitally controlled analog 12 dB/octave multimode filter, which is constructed with aid of external capacitors to the chip. The filter has lowpass, bandpass and highpass outputs, which can be individually selected for final output amplification via master volume register. Using a combined state of lowpass and highpass results in a notch (or inverted bandpass) output.[7] The programmer may vary the filter's cut-off frequency and resonance. An external audio-in port enables external audio to be passed through the filter.",
        "The ring modulation, filter, and programming techniques such as arpeggio (rapid cycling between 2 or more frequencies to make chord-like sounds) together produce the characteristic feel of SID music.",
        "Due to imperfect manufacturing technologies of the time and poor separation between the analog and digital parts of the chip, the 6581's output (before the amplifier stage) was always slightly biased from the zero level. Each time the volume register was altered, an audible click was produced. By quickly adjusting the amplifier's gain through the main 4-bit volume register, this bias could be modulated as PCM, resulting in a \"virtual\" fourth channel allowing 4-bit digital sample playback. The glitch was known and used from an early point on, first by Electronic Speech Systems to produce sampled speech in games such as Impossible Mission (1983, Epyx) and Ghostbusters (1984, Activision). The first instance of samples being used in actual musical compositions was by Martin Galway in Arkanoid (1987, Imagine), although he had copied the idea from an earlier drum synthesizer package called Digidrums. The length of sampled sound playback was limited first by memory and later technique. Kung Fu Fighting (1986), a popular early sample, has a playback length measured in seconds. c64mp3 (2010) and Cubase64 (2010) demonstrate playback lengths measured in minutes. Also, it was hugely CPU intensive - one had to output the samples very fast (in comparison to the speed of the 6510 CPU).",
        "The better manufacturing technology in the 8580 used in the later revisions of Commodore 64C and the Commodore 128DCR caused the bias to almost entirely disappear, causing the digitized sound samples to become very quiet. Fortunately, the volume level could be mostly restored with either a hardware modification (biasing the audio-in pin), or more commonly a software trick involving using the Pulse waveform to intentionally recreate the required bias. The software trick generally renders one voice temporarily unusable, although clever musical compositions can make this problem less noticeable. An excellent example of this quality improvement noticeably reducing a sampled channel can be found in the introduction to Electronic Arts' game Skate or Die (1987). The guitar riff played is all but missing when played on the Commodore 64c or the Commodore 128.",
        "At the X'2008 demo party, a completely new method of playing digitized samples was unveiled. The method allows for an unprecedented four (software-mixed) channels of 8-bit samples with optional filtering on top of all samples, as well as two ordinary SID sound channels.[8][9] The method works by resetting the oscillator using the waveform generator test bit, quickly ramping up the new waveform with the Triangle waveform selected, and then disabling all waveforms, resulting in the DAC continuing to output the last value---which is the desired sample. This continues for as long as two scanlines, which is ample time for glitch-free, arbitrary sample output. It is however more CPU-intensive than the 4-bit volume register DAC trick described above. Because the filtering in a SID chip is applied after the waveform generators, samples produced this way can be filtered normally.",
        "The original manual for the SID mentions that if several waveforms are enabled at the same time, the result will be a binary AND between them. What happens in reality is that the input to the waveform DAC pins receive several waveforms at once. For instance, the Triangle waveform is made with a separate XOR circuit and a shift-to-left circuit. The top bit drives whether the XOR circuit inverts the accumulator value seen by the DAC. Thus, enabling triangle and sawtooth simultaneously causes adjacent accumulator bits in the DAC input to mix. (The XOR circuit does not come to play because it is always disabled whenever the sawtooth waveform is selected.) The pulse waveform is built by joining all the DAC bits together via a long strip of polysilicon, connected to the pulse control logic that digitally compares current accumulator value to the pulse width value. Thus, selecting the pulse waveform together with any other waveform causes every bit on the DAC to partially mix, and the loudness of the waveform is affected by the state of the pulse.",
        "The noise generator is implemented as a 23-bit-length Fibonacci LFSR.[10][11] When using noise waveform simultaneously with any other waveform, the pull-down via waveform selector tends to quickly reduce the XOR shift register to 0 for all bits that are connected to the output DAC. As the zeroes shift in the register when the noise is clocked, and no 1-bits are produced to replace them, a situation can arise where the XOR shift register becomes fully zeroed. Luckily, the situation can be remedied by using the waveform control test bit, which in that condition injects one 1-bit into the XOR shift register. Some musicians are also known to use noise's combined waveforms and test bit to construct unusual sounds.",
        "The 6581 and 8580 differ from each other in several ways. The original 6581 was manufactured using the older NMOS process, which used 12V DC to operate. The 6581 is very sensitive to static discharge and if they weren't handled properly the filters would stop working, explaining the reason of the great quantity of dead 6581s in the market. The 8580 was made using the HMOS-II process, which requires less power (9V DC), and therefore makes the IC run cooler. The 8580 is thus far more durable than the 6581. Also, due to stabler waveform generators, the bit-mixing effects are less noticeable and thus the combined waveforms come close to matching the original SID specification (which stated that they will be combined as a binary AND). The filter is also very different between the two models, with the 6581 cutoff range being a relatively straight line on a log scale, while the cutoff range on the 8580 is a straight line on a linear scale, and is close to the designers' actual specifications. Additionally, a better separation between the analog and the digital circuits made the 8580's output less noisy and distorted. The noise in 6xxx-series systems can be reduced by disconnecting the audio-in pin.",
        "The consumer version of the 8580 was rebadged the 6582, even though the die on the chip is identical to a stock 8580 chip, including the '8580R5' mark. Dr. Evil Laboratories used it in their SID Symphony expansion cartridge (sold to Creative Micro Designs in 1991), and it was used in a few other places as well, including one PC sound-card.",
        "Despite its documented shortcomings, many SID musicians prefer the flawed 6581 chip over the corrected 8580 chip. The main reason for this is that the filter produces strong distortion that is sometimes used to produce simulation of instruments such as a distorted electric guitar. Also, the highpass component of the filter was mixed in 3 dB attenuated compared to the other outputs, making the sound more bassy. In addition to nonlinearities in filter, the D/A circuitry used in the waveform generators produces yet more additional distortion that made its sound richer in character.",
    ];
    private readonly cmds = {
        insert: (element: JSX.Element | HTMLElement | { docId: string, chaincode?: string }) => { alert("insert(?)"); },
        insertText: (lines: string[]) => { alert("insert(text)"); },
        insertContainerComponent: (pkg: string) => { alert("insertContainerComponent(pkg)"); },
    };

    private readonly chaincodeDlg = React.createRef<ChaincodeDialog>();

    // TODO-Fix-Flow: unclear where media lives
    private readonly insertables = [
        { name: "Text", iconName: "Video", onClick: () => { this.cmds.insertText(App.exampleText); }},
        { name: "Video", iconName: "Video", onClick: () => this.cmds.insert(
            <div className={styles.video}>
              <figure style={{ marginInlineStart: 0, marginInlineEnd: 0 }}>
                <video style={{ width: "100%" }} autoPlay={true} loop={true} controls={true} src="/assets/outrun.mp4"></video>
              </figure>
              <figcaption>Figure 1 - Turbo Outrun by Jeroen Tel</figcaption>
            </div>,
        ) },
        /*{ name: "Wedge Left", iconName: "CaretRight", onClick: () => this.cmds.insert(<div className={style.wedgeLeft}></div>) },*/
        { name: "Wedge Right", iconName: "CaretLeft", onClick: () => this.cmds.insert(<div className={style.wedgeRight}></div>) },
        { name: "Chart", iconName: "CaretLeft", onClick: () => this.cmds.insertContainerComponent("@chaincode/chart-view") },
        { name: "Table", iconName: "CaretLeft", onClick: () => this.cmds.insertContainerComponent("@chaincode/table-view") },
        { name: "Table Slice", iconName: "CaretLeft", onClick: () => this.cmds.insertContainerComponent("@chaincode/table-slice") },
        /*{ name: "Flow", iconName: "Text", onClick: () => this.cmds.insert(<FlowEditor cmds={this.cmds} docUrl="http://localhost:3000" docId={Math.random().toString(36).substr(2, 4)}></FlowEditor>) },*/
        { name: "Component", iconName: "Text", onClick: () => { this.chaincodeDlg.current.showDialog(); }},
    ].map(({name, iconName, onClick}) => { return {
        key: `insert${name}`,
        name,
        iconProps: { iconName },
        onClick,
        ["data-automation-id"]: `insert${name}Button`,
    }; });
    // private readonly docId: string;

    constructor(props: Readonly<IProps>) {
        super(props);

        this.state = { virtualize: true };

        // // Extract docId from query parameters
        // const queryParams = window.location.search.substr(1).split('&');
        // let docId = queryParams.shift();

        // // If docId was unspecified, create one and update URL.
        // if (!docId) {
        //     docId = Math.random().toString(36).substr(2, 4);
        //     window.history.pushState("", "", `${window.location.href}?${docId}`);
        // }
        // this.docId = docId;

        initializeIcons();
    }

    public render() {
        // TODO-Fix-Flow: fix alfredURL

        return (
            <div className={style.app}>
                <CommandBar
                    items={this.getItems()}
                    overflowItems={this.getOverlflowItems()}
                    farItems={this.getFarItems()} />
                <div className={`${style.fill} ${ this.state.virtualize ? styles.virtualized : styles.normal }`}>
                    <FlowEditor cmds={this.cmds} config={this.props.config} virtualize={this.state.virtualize}></FlowEditor>
                </div>
                <ChaincodeDialog config={this.props.config} ref={this.chaincodeDlg} addComponent={this.addComponent} />
            </div>
        );
    }

    private addComponent = (docId: string, chaincode: string) => {
        this.cmds.insert({ chaincode, docId });
    }

    // Data for CommandBar
    private getItems = () => {
        return [
            {
                key: "insertItem",
                name: "Insert",
                cacheKey: "myCacheKey", // changing this key will invalidate this items cache
                iconProps: {
                    iconName: "Add",
                },
                subMenuProps: {
                    items: this.insertables,
                },
            },
            {
                key: "virtualizeItem",
                name: "Virtualize",
                cacheKey: "myCacheKey", // changing this key will invalidate this items cache
                canCheck: true,
                checked: this.state.virtualize,
                onClick: () => { this.setState({ virtualize: !this.state.virtualize }); },
            },
        ];
    }

    private getOverlflowItems = () => [] as ICommandBarItemProps[];

    private getFarItems = () => [] as ICommandBarItemProps[];
}
