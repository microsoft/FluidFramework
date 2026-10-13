/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import {
	type ISharedObjectKind,
	makeSharedObjectKind,
	type KernelArgs,
	type SharedKernelFactory,
	type SharedObjectOptions,
	type FactoryOut,
	type SharedObjectKindAlpha,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { FluidClientVersion, type FormatVersion } from "./codec/index.js";
import {
	detachedFieldIndexCodecBuilder,
	DetachedFieldIndexFormatVersion,
} from "./core/index.js";
import {
	SharedTreeKernel,
	type SharedTreeOptions,
	type SharedTreeOptionsInternal,
	type SharedTreeKernelView,
	type RevertibleSupport,
} from "./shared-tree/index.js";
import {
	editManagerCodecName,
	EditManagerFormatVersion,
	messageCodecName,
	MessageFormatVersion,
} from "./shared-tree-core/index.js";
import { SharedTreeFactoryType, SharedTreeAttributes } from "./sharedTreeAttributes.js";
import type { ITree } from "./simple-tree/index.js";
import { Breakable, copyProperty } from "./util/index.js";

function treeKernelFactory(
	options: SharedTreeOptionsInternal & { readonly revertibleSupport: RevertibleSupport },
): SharedKernelFactory<SharedTreeKernelView> {
	function treeFromKernelArgs(args: KernelArgs): SharedTreeKernel {
		if (args.idCompressor === undefined) {
			throw new UsageError("IdCompressor must be enabled to use SharedTree");
		}

		const { minVersionForCollab, ...otherOptions } = options;
		const adjustedOptions = {
			...otherOptions,
			minVersionForCollab:
				minVersionForCollab ?? args.minVersionForCollab ?? FluidClientVersion.v2_0,
		};

		return new SharedTreeKernel(
			new Breakable("SharedTree", args.logger),
			args.sharedObject,
			args.serializer,
			args.submitLocalMessage,
			args.lastSequenceNumber,
			args.initialSequenceNumber,
			args.idCompressor,
			adjustedOptions,
		);
	}

	return {
		create: (args: KernelArgs): FactoryOut<SharedTreeKernelView> => {
			const k = treeFromKernelArgs(args);
			return { kernel: k, view: k.view };
		},

		async loadCore(
			args: KernelArgs,
			storage: IChannelStorageService,
		): Promise<FactoryOut<SharedTreeKernelView>> {
			const k = treeFromKernelArgs(args);
			await k.loadCore(storage);
			return { kernel: k, view: k.view };
		},
	};
}

export function configuredSharedTreeInternal(
	options: SharedTreeOptionsInternal & { readonly revertibleSupport: RevertibleSupport },
): ISharedObjectKind<ITree> & SharedObjectKindAlpha<ITree> {
	const sharedObjectOptions: SharedObjectOptions<ITree> = {
		type: SharedTreeFactoryType,
		attributes: SharedTreeAttributes,
		telemetryContextPrefix: "fluid_sharedTree_",
		factory: treeKernelFactory(options),
	};

	return makeSharedObjectKind<ITree>(sharedObjectOptions);
}

export function resolveOptions(
	options: SharedTreeOptions,
	revertibleSupport: RevertibleSupport,
): SharedTreeOptionsInternal & { readonly revertibleSupport: RevertibleSupport } {
	const internal: SharedTreeOptionsInternal & {
		revertibleSupport: RevertibleSupport;
	} = {
		...resolveFormatOptions(options),
		revertibleSupport,
	};
	for (const optionName of Object.keys(options)) {
		if (optionName !== "revertibleSupport") {
			copyProperty(options, optionName, internal);
		}
	}
	return internal;
}

function resolveFormatOptions(options: SharedTreeOptions): SharedTreeOptionsInternal {
	if (options.enableSharedBranches ?? false) {
		return sharedBranchesOptions;
	}
	return {};
}

const sharedBranchesOptions: SharedTreeOptionsInternal = {
	writeVersionOverrides: new Map<string, FormatVersion>([
		[editManagerCodecName, EditManagerFormatVersion.vSharedBranches],
		[messageCodecName, MessageFormatVersion.vSharedBranches],
		[detachedFieldIndexCodecBuilder.name, DetachedFieldIndexFormatVersion.v2],
	]),
	allowPossiblyIncompatibleWriteVersionOverrides: true,
};
