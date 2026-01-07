/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A DSL for building structured prompts with consistent spacing and organization.
 */
export class PromptBuilder {
	private readonly sections: string[] = [];

	/**
	 * Adds a heading (with # prefix) to the prompt.
	 */
	public addHeading(level: 1 | 2 | 3 | 4 | 5 | 6, text: string): this {
		const prefix = "#".repeat(level);
		this.sections.push(`${prefix} ${text}`);
		return this;
	}

	/**
	 * Adds one or more paragraphs of text to the prompt.
	 */
	public addParagraphs(...texts: string[]): this {
		this.sections.push(...texts);
		return this;
	}

	/**
	 * Adds a code block with the specified language.
	 */
	public addCodeBlock(language: string, code: string): this {
		this.sections.push(`\`\`\`${language}\n${code}\n\`\`\``);
		return this;
	}

	/**
	 * Adds a TypeScript code block.
	 */


	/**
	 * Adds a blank line to the prompt.
	 */
	public addBlank(): this {
		this.sections.push("");
		return this;
	}

	/**
	 * Adds raw content without any modification.
	 */
	public addRaw(content: string): this {
		this.sections.push(content);
		return this;
	}

	/**
	 * Builds the prompt string from all added sections.
	 */
	public build(): string {
		return this.sections.join("\n");
	}
}

/**
 * Parameter documentation for a method.
 */
export interface MethodParameter {
	name: string;
	type: string;
	description?: string;
	isSpread?: boolean;
	isOptional?: boolean;
}
/**
 * Configuration for documenting a method.
 */
export interface MethodDocConfig {
	name: string;
	description: string;
	parameters: MethodParameter[];
	returnType?: string;
	returnDescription?: string;
	remarks?: string;
	examples?: string[];
}

/**
 * Configuration for documenting an interface method.
 */
export interface InterfaceMethodConfig {
	name: string;
	description: string;
	parameters: MethodParameter[];
	returnType?: string;
	returnDescription?: string;
	throws?: string[];
	remarks?: string;
	examples?: string[];
}

/**
 * Configuration for documenting an interface property.
 */
export interface InterfacePropertyConfig {
	name: string;
	description: string;
	type: string;
	isOptional?: boolean;
	remarks?: string;
	examples?: string[];
}

/**
 * A prompt builder for constructing TypeScript interface definitions with method documentation.
 */
export class InterfaceBuilder {
	private readonly methods: InterfaceMethodConfig[] = [];
	private readonly properties: InterfacePropertyConfig[] = [];
	private readonly typeParameters: string[];
	private readonly extendsClause: string | undefined;
	private multiLineSignatures: boolean = false;

	/**
	 * Creates a new InterfaceBuilder.
	 */
	public constructor(
		private readonly name: string,
		private readonly description: string,
		typeParamNames?: string[],
		baseInterface?: string,
		private readonly remarks?: string,
		private readonly isExported: boolean = false,
	) {
		this.typeParameters = typeParamNames ?? [];
		this.extendsClause = baseInterface;
	}

	/**
	 * Enables multi-line formatting for method signatures.
	 * When enabled, parameters will be placed on separate lines for better readability.
	 */
	public enableMultiLineSignatures(): this {
		this.multiLineSignatures = true;
		return this;
	}

	/**
	 * Adds a method to the interface.
	 */
	public addMethod(config: InterfaceMethodConfig): this {
		this.methods.push(config);
		return this;
	}

	/**
	 * Adds a property to the interface.
	 */
	public addProperty(config: InterfacePropertyConfig): this {
		this.properties.push(config);
		return this;
	}

	/**
	 * Builds the TypeScript interface definition as a string.
	 */
	public build(): string {
		const lines: string[] = [];

		// Add the JSDoc comment for the interface
		lines.push("/**");
		lines.push(` * ${this.description}`);
		if (this.remarks !== undefined) {
			lines.push(` * @remarks ${this.remarks}`);
		}
		lines.push(" */");

		// Add the interface declaration
		const typeParameterString =
			this.typeParameters.length > 0 ? `<${this.typeParameters.join(", ")}>` : "";
		const extendsString =
			this.extendsClause === undefined ? "" : ` extends ${this.extendsClause}`;
		const exportString = this.isExported ? "export " : "";
		lines.push(
			`${exportString}interface ${this.name}${typeParameterString}${extendsString} {`,
		);

		// Add properties and methods
		const propertiesAndMethods = [...this.properties, ...this.methods];
		for (const [index, propertyOrMethod] of propertiesAndMethods.entries()) {
			if (index > 0) {
				lines.push("");
			}

			if ("type" in propertyOrMethod) {
				// Property
				const {
					name: propertyName,
					description: propertyDescription,
					type,
					isOptional,
					remarks,
					examples,
				} = propertyOrMethod;

				const docLines: string[] = ["/**"];
				docLines.push(` * ${propertyDescription}`);

				if (remarks !== undefined && remarks.length > 0) {
					docLines.push(` *`);
					docLines.push(` * @remarks`);
					for (const line of remarks.split("\n")) {
						docLines.push(` * ${line}`);
					}
				}

				if (examples !== undefined && examples.length > 0) {
					docLines.push(` *`);
					for (const example of examples) {
						docLines.push(` * ${example}`);
					}
				}

				docLines.push(` */`);

				for (const line of docLines) {
					lines.push(`	${line}`);
				}

				const optionalMarker = isOptional === true ? "?" : "";
				lines.push(`	${propertyName}${optionalMarker}: ${type};`);
			} else {
				// Method
				const {
					name: methodName,
					description: methodDesc,
					parameters,
					returnType,
					returnDescription,
					throws,
					remarks,
					examples,
				} = propertyOrMethod;

				const docLines: string[] = ["/**"];
				docLines.push(` * ${methodDesc}`);

				if (parameters.length > 0) {
					for (const {
						name: parameterName,
						description: parameterDescription,
					} of parameters) {
						const parameterDocumentation =
							parameterDescription === undefined ? "" : ` - ${parameterDescription}`;
						docLines.push(` * @param ${parameterName}${parameterDocumentation}`);
					}
				}

				if (returnType !== undefined) {
					const returnDoc = returnDescription === undefined ? "" : ` - ${returnDescription}`;
					docLines.push(` * @returns \`${returnType}\`${returnDoc}`);
				}

				if (remarks !== undefined && remarks.length > 0) {
					docLines.push(` *`);
					docLines.push(` * @remarks`);
					for (const line of remarks.split("\n")) {
						docLines.push(` * ${line}`);
					}
				}

				if (throws !== undefined && throws.length > 0) {
					for (const throwsDescription of throws) {
						const throwsLines = throwsDescription.split("\n");
						docLines.push(` * @throws ${throwsLines[0]}`);
						for (let i = 1; i < throwsLines.length; i++) {
							docLines.push(` * ${throwsLines[i]}`);
						}
					}
				}

				if (examples !== undefined && examples.length > 0) {
					docLines.push(` *`);
					for (const example of examples) {
						docLines.push(` * ${example}`);
					}
				}

				docLines.push(` */`);

				for (const line of docLines) {
					lines.push(`	${line}`);
				}

				if (this.multiLineSignatures && parameters.length > 0) {
					lines.push(`	${methodName}(`);
					for (let i = 0; i < parameters.length; i++) {
						const param = parameters[i];
						if (param !== undefined) {
							const { name: paramName, type, isSpread: isSpread, isOptional } = param;
							const paramSignature = `${isSpread === true ? "..." : ""}${paramName}${isOptional === true ? "?" : ""}: ${type}`;
							const isLastParam = i === parameters.length - 1;
							lines.push(`		${paramSignature}${isLastParam ? "" : ","}`);
						}
					}
					const returnTypeStr = returnType ?? "void";
					lines.push(`	): ${returnTypeStr};`);
				} else {
					const paramList = parameters
						.map(
							({ name: paramName, type, isSpread: isSpread, isOptional }) =>
								`${isSpread === true ? "..." : ""}${paramName}${isOptional === true ? "?" : ""}: ${type}`,
						)
						.join(", ");
					const returnTypeStr = returnType ?? "void";
					lines.push(`	${methodName}(${paramList}): ${returnTypeStr};`);
				}
			}
		}

		lines.push("}");

		return lines.join("\n");
	}
}
