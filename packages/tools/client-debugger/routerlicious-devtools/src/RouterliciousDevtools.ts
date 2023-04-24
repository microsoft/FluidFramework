import {
	ContainerDevtoolsProps,
	DevtoolsLogger,
	IFluidDevtools,
	initializeFluidDevtools,
	VisualizeSharedObject,
} from "@fluid-tools/client-debugger";
import { FluidContainer, IFluidContainer } from "@fluidframework/fluid-static";

/**
 * Properties for configuring Devtools for an individual {@link IFluidContainer}.
 *
 * @public
 */
export interface FluidContainerDevtoolsProps {
	/**
	 * The Container with which the {@link ContainerDevtools} instance will be associated.
	 */
	container: IFluidContainer;

	/**
	 * (optional) Nickname for the {@link FluidContainerDevtoolsProps.container | Container} / debugger instance.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between instances using
	 * semantically meaningful information.
	 */
	containerNickname?: string;
}

/**
 * Properties for configuring a {@link FluidDevtools}.
 *
 * @public
 */
export interface RouterliciousDevtoolsProps {
	/**
	 * (optional) telemetry logger associated with the Fluid runtime.
	 *
	 * @remarks
	 *
	 * Note: {@link FluidDevtools} does not register this logger with the Fluid runtime; that must be done separately.
	 *
	 * This is provided to the Devtools instance strictly to enable communicating supported / desired functionality with
	 * external listeners.
	 */
	logger?: DevtoolsLogger;

	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IRouterliciousDevtools.registerContainerDevtools}.
	 */
	initialContainers?: FluidContainerDevtoolsProps[];

	/**
	 * (optional) Configurations for generating visual representations of
	 * {@link @fluidframework/shared-object-base#ISharedObject}s under {@link FluidContainerDevtoolsProps.containerData}.
	 *
	 * @remarks
	 *
	 * If not specified, then only `SharedObject` types natively known by the system will be visualized, and using
	 * default visualization implementations.
	 *
	 * If a visualizer configuration is specified for a shared object type that has a default visualizer, the custom one will be used.
	 */
	dataVisualizers?: Record<string, VisualizeSharedObject>;
}

/**
 * {@link IRouterliciousDevtools} implementation.
 *
 * @remarks
 *
 * TODO (e.g. do we talk about window messaging here?)
 *
 * @sealed
 * @internal
 */
export class RouterliciousDevtools {
	// extends TypedEventEmitter<ContainerDevtoolsEvents>
	// implements IContainerDevtools

	/**
	 * Inner Devtools instance.
	 */
	private readonly _devtools: IFluidDevtools;

	/**
	 * Whether or not the instance has been disposed yet.
	 *
	 * @remarks Not related to Container disposal.
	 *
	 * @see {@link IRouterliciousDevtools.dispose}
	 */
	private _disposed: boolean;

	public constructor(_devtools: IFluidDevtools) {
		// super();

		this._devtools = _devtools;

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IContainerDevtools.dispose}
	 */
	public dispose(): void {
		this._devtools.dispose();
		this._disposed = true;
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}
}

/**
 * TODO
 */
export function initializeDevtools(props: RouterliciousDevtoolsProps): RouterliciousDevtools {
	const { dataVisualizers, initialContainers, logger } = props;

	const mappedContainerProps: ContainerDevtoolsProps[] = mapContainerProps(
		initialContainers,
		dataVisualizers,
	);

	const innerDevtools = initializeFluidDevtools({
		logger,
		initialContainers: mappedContainerProps,
	});

	return new RouterliciousDevtools(innerDevtools);
}

function mapContainerProps(
	containers: FluidContainerDevtoolsProps[] | undefined,
	dataVisualizers?: Record<string, VisualizeSharedObject>,
): ContainerDevtoolsProps[] | undefined {
	if (containers === undefined) {
		return undefined;
	}

	const mappedContainerProps: ContainerDevtoolsProps[] = [];
	for (const containerProps of containers) {
		const { container, containerNickname } = containerProps;
		if ((container as FluidContainer).INTERNAL_CONTAINER_DO_NOT_USE === undefined) {
			console.error("Missing Container accessor on FluidContainer.");
		} else {
			const innerContainer = (container as FluidContainer).INTERNAL_CONTAINER_DO_NOT_USE();
			mappedContainerProps.push({
				container: innerContainer,
				containerId: container.id,
				containerNickname,
				containerData: container.initialObjects,
				dataVisualizers,
			});
		}
	}
}
