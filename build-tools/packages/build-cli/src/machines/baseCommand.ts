import { Flags } from "@oclif/core";
import { Machine } from "jssm";
import { BaseCommand } from "../base";
import { HandlerData } from "./handlers";
import { StateHandler } from "./types";

/**
 * A base command that uses an internal state machine to govern its behavior.
 */
export abstract class StateMachineCommand<
    T extends typeof StateMachineCommand.flags,
> extends BaseCommand<T> {
    static flags = {
        ...BaseCommand.flags,
        // Test mode flags
        testMode: Flags.boolean({
            default: false,
            description: "Enables test mode. This flag enables other flags used for testing.",
            hidden: true,
        }),
        state: Flags.string({
            description:
                "A state to start in when the command initializes. Used to test the processing of specific states.",
            dependsOn: ["testMode"],
            hidden: true,
        }),
    };

    abstract get machine(): Machine<unknown>;
    abstract get data(): HandlerData;
    abstract set data(d: HandlerData);

    abstract handler: StateHandler | undefined;

    async init(): Promise<void> {
        await super.init();
        await this.initMachineHooks();
    }

    /** Wires up some hooks on the machine to do logging */
    protected async initMachineHooks() {
        for (const state of this.machine.states()) {
            if (this.machine.state_is_terminal(state) === true) {
                this.machine.hook_entry(state, (o: any) => {
                    const { from, action } = o;
                    this.verbose(`${state}: ${action} from ${from}`);
                });
            }
        }

        this.machine.hook_any_transition((t: any) => {
            const { action, from, to } = t;
            this.verbose(`STATE MACHINE: ${from} [${action}] ==> ${to}`);
        });
    }

    /** Loops over the state machine and calls handleState for each machine state. Subclasses should call this at the
     * end of their `run` method. */
    protected async stateLoop(): Promise<void> {
        const flags = this.processedFlags;
        const context = await this.getContext();

        if (flags.testMode === true) {
            const machineStates = this.machine.states();
            if (flags.state !== undefined) {
                if (!machineStates.includes(flags.state)) {
                    throw new Error(`State not found in state machine`);
                }
                // const result = this.machine.force_transition(flags.state);
                // assert(result === true, `Couldn't force transitions to ${flags.state}`);

                const handled = await this.handler?.handleState(
                    context,
                    flags.state,
                    this.machine,
                    this.processedFlags.testMode,
                    this.logger,
                    this.data,
                );
                // this.log(`handled:${handled}`);
                if (handled === true) {
                    this.exit(0);
                } else {
                    this.exit(1);
                }
            }
        } else {
            do {
                const state = this.machine.state();

                this.log(`Handling state: ${state}`);
                // eslint-disable-next-line no-await-in-loop
                const handled = await this.handler?.handleState(
                    context,
                    state,
                    this.machine,
                    this.processedFlags.testMode,
                    this.logger,
                    this.data,
                );
                if (handled !== true) {
                    this.error(`Unhandled state: ${state}`);
                }
                // eslint-disable-next-line no-constant-condition
            } while (true);
        }
    }

    async run(): Promise<void> {
        await this.stateLoop();
    }
}
