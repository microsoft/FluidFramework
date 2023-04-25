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
	 * The ID of the {@link FluidContainerDevtoolsProps.container | Container}.
	 */
	containerId: string;

	/**
	 * (optional) Nickname for the {@link FluidContainerDevtoolsProps.container | Container} / debugger instance.
	 *
	 * @remarks
	 *
	 * Associated tooling may take advantage of this to differentiate between instances using
	 * semantically meaningful information.
	 *
	 * If not provided, the {@link ContainerDevtoolsProps.containerId} will be used for the purpose of distinguishing
	 * instances.
	 */
	containerNickname?: string;

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

	public constructor(_devtools: IFluidDevtools) {
		// super();

		this._devtools = _devtools;
	}

	/**
	 * {@inheritDoc IRouterliciousDevtools.registerContainerDevtools}
	 */
	public registerContainerDevtools(containerProps: FluidContainerDevtoolsProps): void {
		const mappedContainerProps = mapContainerProps(containerProps);
		if (mappedContainerProps !== undefined) {
			this._devtools.registerContainerDevtools(mappedContainerProps);
		}
	}

	/**
	 * {@inheritDoc IRouterliciousDevtools.dispose}
	 */
	public dispose(): void {
		this._devtools.dispose();
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._devtools.disposed;
	}
}

/**
 * TODO
 */
export function initializeDevtools(props: RouterliciousDevtoolsProps): RouterliciousDevtools {
	const { initialContainers, logger } = props;

	let mappedInitialContainers: ContainerDevtoolsProps[] | undefined;
	if (initialContainers !== undefined) {
		mappedInitialContainers = [];
		for (const containerProps of initialContainers) {
			const mappedContainerProps = mapContainerProps(containerProps);
			if (mappedContainerProps !== undefined) {
				mappedInitialContainers.push(mappedContainerProps);
			}
		}
	}

	const innerDevtools = initializeFluidDevtools({
		logger,
		initialContainers: mappedInitialContainers,
	});

	return new RouterliciousDevtools(innerDevtools);
}

function mapContainerProps(
	containerProps: FluidContainerDevtoolsProps,
): ContainerDevtoolsProps | undefined {
	const { container, containerId, containerNickname, dataVisualizers } = containerProps;
	const fluidContainer = container as FluidContainer;

	if (fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE === undefined) {
		console.error("Missing Container accessor on FluidContainer.");
		return undefined;
	}

	const innerContainer = fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE();
	return {
		container: innerContainer,
		containerId,
		containerNickname,
		containerData: container.initialObjects,
		dataVisualizers,
	};
}
