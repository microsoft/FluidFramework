/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/require-jsdoc */

export const dummy = 1;

// import type { FixRecursiveArraySchema } from "@fluidframework/tree";
// import type { ValidateRecursiveSchema } from "@fluidframework/tree";
// import { SchemaFactory } from "@fluidframework/tree";

// const sf = new SchemaFactory("d302b84c-75f6-4ecd-9663-524f467013e9");

// export class NumberInputAccess extends sf.object("NumberInputAccess", {
// 	id: sf.identifier,
// 	inputName: sf.string,
// }) {}

// export class RandomNumber extends sf.object("RandomNumber", {
// 	id: sf.identifier,
// 	max: sf.number,
// }) {}

// export class TimeAccess extends sf.object("TimeAccess", {
// 	id: sf.identifier,
// }) {}

// // Expression types - polymorphic expressions that can evaluate to different types
// const PolymorphicExpression = [
// 	() => VariableRef,
// 	() => Property,
// 	() => ExpressionBlock,
// 	() => ConditionalExpression,
// 	() => FunctionCall,
// 	() => Index,
// 	() => Append,
// 	() => Assignment,
// ] as const;

// // Boolean expressions
// const BooleanExpression = [
// 	sf.boolean,
// 	() => Not,
// 	() => LogicalAnd,
// 	() => LogicalOr,
// 	() => LessThan,
// 	() => LessThanOrEqual,
// 	() => GreaterThan,
// 	() => GreaterThanOrEqual,
// 	() => AreEqual,
// 	() => BooleanInputAccess,
// 	...PolymorphicExpression,
// ] as const;

// // Number expressions
// const NumberExpression = [
// 	SchemaFactory.number,
// 	() => Sum,
// 	() => Difference,
// 	() => Product,
// 	() => Division,
// 	() => Remainder,
// 	() => Power,
// 	() => Negative,
// 	() => Sin,
// 	() => Cos,
// 	() => Tan,
// 	() => Atan2,
// 	() => Abs,
// 	() => Round,
// 	() => Floor,
// 	() => Ceil,
// 	() => BitwiseAnd,
// 	() => BitwiseOr,
// 	() => BitwiseXor,
// 	() => BitwiseLeftShift,
// 	() => BitwiseRightShift,
// 	() => BitwiseUnsignedRightShift,
// 	() => Min,
// 	() => Max,
// 	() => NumberInputAccess,
// 	() => Length,
// 	() => RandomNumber,
// 	() => TimeAccess,
// 	...PolymorphicExpression,
// ] as const;

// // Array expressions
// const ArrayExpression = [() => ArrayLiteral, ...PolymorphicExpression] as const;

// export class Length extends sf.objectRecursive("Length", {
// 	id: sf.identifier,
// 	array: ArrayExpression,
// }) {}

// // Object expressions
// const ObjectExpression = [() => ObjectLiteral, ...PolymorphicExpression] as const;

// // Function expressions
// const FunctionExpression = [
// 	() => FunctionDef,
// 	() => ProcedureDef,
// 	...PolymorphicExpression,
// ] as const;

// // Boolean operators
// export class Not extends sf.objectRecursive("Not", {
// 	id: sf.identifier,
// 	operand: BooleanExpression,
// }) {}

// export class Operands extends sf.arrayRecursive("Operands", BooleanExpression) {}

// export class Conjuncts extends sf.objectRecursive("Conjuncts", {
// 	id: sf.identifier,
// 	operands: Operands,
// }) {}

// export class LogicalAnd extends sf.objectRecursive("LogicalAnd", {
// 	id: sf.identifier,
// 	conjuncts: Conjuncts,
// }) {}

// export class Disjuncts extends sf.objectRecursive("Disjuncts", {
// 	id: sf.identifier,
// 	operands: Operands,
// }) {}

// export class LogicalOr extends sf.objectRecursive("LogicalOr", {
// 	id: sf.identifier,
// 	disjuncts: Disjuncts,
// }) {}

// export class LessThan extends sf.objectRecursive("LessThan", {
// 	id: sf.identifier,
// 	left: NumberExpression,
// 	right: NumberExpression,
// }) {}

// export class LessThanOrEqual extends sf.objectRecursive("LessThanOrEqual", {
// 	id: sf.identifier,
// 	left: NumberExpression,
// 	right: NumberExpression,
// }) {}

// export class GreaterThan extends sf.objectRecursive("GreaterThan", {
// 	id: sf.identifier,
// 	left: NumberExpression,
// 	right: NumberExpression,
// }) {}

// export class GreaterThanOrEqual extends sf.objectRecursive("GreaterThanOrEqual", {
// 	id: sf.identifier,
// 	left: NumberExpression,
// 	right: NumberExpression,
// }) {}

// {
// 	type _checkGreaterThan = ValidateRecursiveSchema<typeof GreaterThanOrEqual>;
// }

// // All expressions combined
// const Expression = [
// 	sf.boolean,
// 	Not,
// 	LogicalAnd,
// 	LogicalOr,
// 	LessThan,
// 	LessThanOrEqual,
// 	GreaterThan,
// 	GreaterThanOrEqual,
// 	() => AreEqual,
// 	() => BooleanInputAccess,
// 	SchemaFactory.number,
// 	() => Sum,
// 	() => Difference,
// 	() => Product,
// 	() => Division,
// 	() => Remainder,
// 	() => Power,
// 	() => Negative,
// 	() => Sin,
// 	() => Cos,
// 	() => Tan,
// 	() => Atan2,
// 	() => Abs,
// 	() => Round,
// 	() => Floor,
// 	() => Ceil,
// 	() => BitwiseAnd,
// 	() => BitwiseOr,
// 	() => BitwiseXor,
// 	() => BitwiseLeftShift,
// 	() => BitwiseRightShift,
// 	() => BitwiseUnsignedRightShift,
// 	() => Min,
// 	() => Max,
// 	NumberInputAccess,
// 	Length,
// 	RandomNumber,
// 	TimeAccess,
// 	() => ArrayLiteral,
// 	() => ObjectLiteral,
// 	() => FunctionDef,
// 	() => ProcedureDef,
// 	() => VariableRef,
// 	() => Property,
// 	() => ExpressionBlock,
// 	() => ConditionalExpression,
// 	() => FunctionCall,
// 	() => Index,
// 	() => Append,
// 	() => Assignment,
// 	() => Point,
// 	() => ColorLiteral,
// ] as const;

// // Statements
// const Statement = [
// 	() => StatementBlock,
// 	() => VariableDef,
// 	() => ProcedureCall,
// 	() => IfStatement,
// 	() => WhileLoop,
// 	() => ReturnStatement,
// 	...Expression,
// ] as const;

// // Drawing statements
// const DrawingStatement = [
// 	...Statement,
// 	() => DrawingBlock,
// 	() => DrawingProcedureDef,
// 	() => DrawingIfStatement,
// 	() => AnimationWhileLoop,
// 	() => DrawCircle,
// ] as const;

// const EqualityOperandsBaseX = sf.arrayRecursive("EqualityOperands", [
// 	sf.boolean,
// 	Not,
// 	LogicalAnd,
// 	LogicalOr,
// 	LessThan,
// 	LessThanOrEqual,
// 	GreaterThan,
// 	GreaterThanOrEqual,
// 	() => AreEqual,
// 	() => BooleanInputAccess,
// 	SchemaFactory.number,
// 	() => Sum,
// 	() => Difference,
// 	() => Product,
// 	() => Division,
// 	() => Remainder,
// 	() => Power,
// 	() => Negative,
// 	() => Sin,
// 	() => Cos,
// 	() => Tan,
// 	() => Atan2,
// 	() => Abs,
// 	() => Round,
// 	() => Floor,
// 	() => Ceil,
// 	() => BitwiseAnd,
// 	() => BitwiseOr,
// 	() => BitwiseXor,
// 	() => BitwiseLeftShift,
// 	() => BitwiseRightShift,
// 	() => BitwiseUnsignedRightShift,
// 	() => Min,
// 	() => Max,
// 	NumberInputAccess,
// 	Length,
// 	RandomNumber,
// 	TimeAccess,
// 	() => ArrayLiteral,
// 	() => ObjectLiteral,
// 	() => FunctionDef,
// 	() => ProcedureDef,
// 	() => VariableRef,
// 	() => Property,
// 	() => ExpressionBlock,
// 	() => ConditionalExpression,
// 	() => FunctionCall,
// 	() => Index,
// 	() => Append,
// 	() => Assignment,
// 	() => Point,
// 	() => ColorLiteral,
// ]);

// const EqualityOperandsBase = sf.arrayRecursive("EqualityOperands", Expression);
// export class EqualityOperands extends EqualityOperandsBase {}

// {
// 	// @ts-expect-error Recursion limit
// 	type _checkGreaterThan1 = ValidateRecursiveSchema<typeof EqualityOperands>;
// 	type _checkGreaterThan2 = ValidateRecursiveSchema<typeof EqualityOperands>;
// }

// const fields = {
// 	id: sf.identifier,
// 	operands: EqualityOperands,
// } as const;
// const AreEqualBase = sf.objectRecursive("AreEqual", fields);

// export class AreEqual extends AreEqualBase {}

// export class BooleanInputAccess extends sf.object("BooleanInputAccess", {
// 	id: sf.identifier,
// 	inputName: sf.string,
// }) {}

// // Number operators
// export class NumberExpressions extends sf.arrayRecursive(
// 	"NumberExpressions",
// 	NumberExpression,
// ) {}

// export class Sum extends sf.objectRecursive("Sum", {
// 	id: sf.identifier,
// 	addends: NumberExpressions,
// }) {}

// export class Difference extends sf.objectRecursive("Difference", {
// 	id: sf.identifier,
// 	minuend: NumberExpression,
// 	subtrahend: NumberExpression,
// }) {}

// export class Product extends sf.objectRecursive("Product", {
// 	id: sf.identifier,
// 	factors: NumberExpressions,
// }) {}

// export class Division extends sf.objectRecursive("Division", {
// 	id: sf.identifier,
// 	dividend: NumberExpression,
// 	divisor: NumberExpression,
// }) {}

// export class Remainder extends sf.objectRecursive("Remainder", {
// 	id: sf.identifier,
// 	dividend: NumberExpression,
// 	divisor: NumberExpression,
// }) {}

// export class Power extends sf.objectRecursive("Power", {
// 	id: sf.identifier,
// 	base: NumberExpression,
// 	exponent: NumberExpression,
// }) {}

// export class Negative extends sf.objectRecursive("Negative", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Sin extends sf.objectRecursive("Sin", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Cos extends sf.objectRecursive("Cos", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Tan extends sf.objectRecursive("Tan", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Atan2 extends sf.objectRecursive("Atan2", {
// 	id: sf.identifier,
// 	y: NumberExpression,
// 	x: NumberExpression,
// }) {}

// export class Abs extends sf.objectRecursive("Abs", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Round extends sf.objectRecursive("Round", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Floor extends sf.objectRecursive("Floor", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class Ceil extends sf.objectRecursive("Ceil", {
// 	id: sf.identifier,
// 	operand: NumberExpression,
// }) {}

// export class BitwiseAnd extends sf.objectRecursive("BitwiseAnd", {
// 	id: sf.identifier,
// 	operands: NumberExpressions,
// }) {}

// export class BitwiseOr extends sf.objectRecursive("BitwiseOr", {
// 	id: sf.identifier,
// 	operands: NumberExpressions,
// }) {}

// export class BitwiseXor extends sf.objectRecursive("BitwiseXor", {
// 	id: sf.identifier,
// 	left: NumberExpression,
// 	right: NumberExpression,
// }) {}

// export class BitwiseLeftShift extends sf.objectRecursive("BitwiseLeftShift", {
// 	id: sf.identifier,
// 	value: NumberExpression,
// 	shift: NumberExpression,
// }) {}

// export class BitwiseRightShift extends sf.objectRecursive("BitwiseRightShift", {
// 	id: sf.identifier,
// 	value: NumberExpression,
// 	shift: NumberExpression,
// }) {}

// export class BitwiseUnsignedRightShift extends sf.objectRecursive(
// 	"BitwiseUnsignedRightShift",
// 	{
// 		id: sf.identifier,
// 		value: NumberExpression,
// 		shift: NumberExpression,
// 	},
// ) {}

// export class Min extends sf.objectRecursive("Min", {
// 	id: sf.identifier,
// 	values: NumberExpressions,
// }) {}

// export class Max extends sf.objectRecursive("Max", {
// 	id: sf.identifier,
// 	values: NumberExpressions,
// }) {}

// // Array and object types
// export class ArrayItems extends sf.arrayRecursive("ArrayItems", Expression) {}

// export class ArrayLiteral extends sf.objectRecursive("ArrayLiteral", {
// 	id: sf.identifier,
// 	items: ArrayItems,
// }) {}

// export class Properties extends sf.mapRecursive("Properties", Expression) {}

// export class ObjectLiteral extends sf.objectRecursive("ObjectLiteral", {
// 	id: sf.identifier,
// 	properties: Properties,
// }) {}

// // Variable reference
// export class VariableRef extends sf.object("VariableRef", {
// 	id: sf.identifier,
// 	variableName: sf.string,
// }) {}

// // Statements
// export class Statements extends sf.arrayRecursive("Statements", Statement) {}

// export class StatementBlock extends sf.objectRecursive("StatementBlock", {
// 	id: sf.identifier,
// 	statements: Statements,
// }) {}

// export class ExpressionBlock extends sf.objectRecursive("ExpressionBlock", {
// 	id: sf.identifier,
// 	statements: Statements,
// 	result: Expression,
// }) {}

// export class ConditionalExpression extends sf.objectRecursive("ConditionalExpression", {
// 	id: sf.identifier,
// 	condition: BooleanExpression,
// 	thenExpression: Expression,
// 	elseExpression: Expression,
// }) {}

// export class Arguments extends sf.mapRecursive("Arguments", Expression) {}

// export class FunctionCall extends sf.objectRecursive("FunctionCall", {
// 	id: sf.identifier,
// 	function: FunctionExpression,
// 	arguments: Arguments,
// }) {}

// export class Property extends sf.objectRecursive("Property", {
// 	id: sf.identifier,
// 	object: ObjectExpression,
// 	propertyName: sf.string,
// }) {}

// export class Index extends sf.objectRecursive("Index", {
// 	id: sf.identifier,
// 	array: ArrayExpression,
// 	index: NumberExpression,
// }) {}

// export class Append extends sf.objectRecursive("Append", {
// 	id: sf.identifier,
// 	array: ArrayExpression,
// 	value: Expression,
// }) {}

// export class Assignment extends sf.objectRecursive("Assignment", {
// 	id: sf.identifier,
// 	target: Expression, // Should be VariableRef, Property, or Index
// 	value: Expression,
// }) {}

// export class VariableDef extends sf.objectRecursive("VariableDef", {
// 	id: sf.identifier,
// 	variableName: sf.string,
// 	initialValue: Expression,
// }) {}

// export class ProcedureCall extends sf.objectRecursive("ProcedureCall", {
// 	id: sf.identifier,
// 	procedure: Expression, // Should be a string or FunctionExpression
// 	arguments: Arguments,
// }) {}

// export class IfStatement extends sf.objectRecursive("IfStatement", {
// 	id: sf.identifier,
// 	condition: BooleanExpression,
// 	thenStatement: Statement,
// 	elseStatement: Statement,
// }) {}

// export class WhileLoop extends sf.objectRecursive("WhileLoop", {
// 	id: sf.identifier,
// 	condition: BooleanExpression,
// 	body: Statement,
// }) {}

// export class ReturnStatement extends sf.objectRecursive("ReturnStatement", {
// 	id: sf.identifier,
// 	value: Expression,
// }) {}

// // Function and procedure definitions
// export class Formals extends sf.array("Formals", sf.string) {}

// export class FunctionDef extends sf.objectRecursive("FunctionDef", {
// 	id: sf.identifier,
// 	name: sf.optional(sf.string),
// 	formals: Formals,
// 	body: Expression,
// }) {}

// export class ProcedureDef extends sf.objectRecursive("ProcedureDef", {
// 	id: sf.identifier,
// 	name: sf.optional(sf.string),
// 	formals: Formals,
// 	body: Statement,
// }) {}

// // Graphics primitives
// export class Coordinates extends sf.arrayRecursive("Coordinates", NumberExpression) {}

// export class Point extends sf.objectRecursive("Point", {
// 	id: sf.identifier,
// 	coordinates: Coordinates,
// }) {}

// export class Color extends sf.object("Color", {
// 	id: sf.identifier,
// 	h: sf.number,
// 	s: sf.number,
// 	l: sf.number,
// 	a: sf.number,
// }) {}

// export class ColorLiteral extends sf.objectRecursive("ColorLiteral", {
// 	id: sf.identifier,
// 	color: Color,
// }) {}

// // Drawing operations
// export class DrawCircle extends sf.objectRecursive("DrawCircle", {
// 	id: sf.identifier,
// 	center: Expression, // Should be a Point
// 	radius: NumberExpression,
// 	fill: Expression, // Should be a ColorLiteral
// }) {}

// // Drawing statements
// export class DrawingStatements extends sf.arrayRecursive(
// 	"DrawingStatements",
// 	DrawingStatement,
// ) {}

// export class DrawingBlock extends sf.objectRecursive("DrawingBlock", {
// 	id: sf.identifier,
// 	statements: DrawingStatements,
// }) {}

// export class DrawingProcedureDef extends sf.objectRecursive("DrawingProcedureDef", {
// 	id: sf.identifier,
// 	name: sf.string,
// 	formals: Formals,
// 	body: DrawingStatement,
// }) {}

// export class DrawingIfStatement extends sf.objectRecursive("DrawingIfStatement", {
// 	id: sf.identifier,
// 	condition: BooleanExpression,
// 	thenStatement: DrawingStatement,
// 	elseStatement: DrawingStatement,
// }) {}

// export class AnimationWhileLoop extends sf.objectRecursive("AnimationWhileLoop", {
// 	id: sf.identifier,
// 	condition: BooleanExpression,
// 	body: DrawingStatement,
// }) {}

// // Animation setup block
// export class AnimationDefinitions extends sf.arrayRecursive(
// 	"AnimationDefinitions",
// 	Statement,
// ) {}

// export class AnimationDefinitionBlock extends sf.objectRecursive("AnimationDefinitionBlock", {
// 	id: sf.identifier,
// 	statements: AnimationDefinitions,
// }) {}

// // Program types
// export class ExpressionProgram extends sf.objectRecursive("ExpressionProgram", {
// 	id: sf.identifier,
// 	expression: Expression,
// }) {}

// export class DrawingProgram extends sf.objectRecursive("DrawingProgram", {
// 	id: sf.identifier,
// 	drawing: DrawingStatement,
// }) {}

// export class Animation extends sf.objectRecursive("Animation", {
// 	id: sf.identifier,
// 	initialize: AnimationDefinitionBlock,
// 	drawFrame: DrawingStatement,
// }) {}

// export class AnimationProgram extends sf.objectRecursive("AnimationProgram", {
// 	id: sf.identifier,
// 	animation: Animation,
// }) {}

// // Program types
// export const Program = [ExpressionProgram, DrawingProgram, AnimationProgram] as const;

// // Type validations
// {
// 	type _checkNot = ValidateRecursiveSchema<typeof Not>;
// 	type _checkConjuncts = ValidateRecursiveSchema<typeof Conjuncts>;
// 	type _checkLogicalAnd = ValidateRecursiveSchema<typeof LogicalAnd>;
// 	type _checkDisjuncts = ValidateRecursiveSchema<typeof Disjuncts>;
// 	type _checkLogicalOr = ValidateRecursiveSchema<typeof LogicalOr>;
// 	type _checkLessThan = ValidateRecursiveSchema<typeof LessThan>;
// 	type _checkLessThanOrEqual = ValidateRecursiveSchema<typeof LessThanOrEqual>;
// 	type _checkGreaterThan = ValidateRecursiveSchema<typeof GreaterThan>;
// 	type _checkGreaterThanOrEqual = ValidateRecursiveSchema<typeof GreaterThanOrEqual>;
// 	type _checkEqualityOperands = ValidateRecursiveSchema<typeof EqualityOperands>;
// 	type _checkAreEqual = ValidateRecursiveSchema<typeof AreEqual>;
// 	type _checkNumberExpressions = ValidateRecursiveSchema<typeof NumberExpressions>;
// 	type _checkSum = ValidateRecursiveSchema<typeof Sum>;
// 	type _checkDifference = ValidateRecursiveSchema<typeof Difference>;
// 	type _checkProduct = ValidateRecursiveSchema<typeof Product>;
// 	type _checkDivision = ValidateRecursiveSchema<typeof Division>;
// 	type _checkRemainder = ValidateRecursiveSchema<typeof Remainder>;
// 	type _checkPower = ValidateRecursiveSchema<typeof Power>;
// 	type _checkNegative = ValidateRecursiveSchema<typeof Negative>;
// 	type _checkSin = ValidateRecursiveSchema<typeof Sin>;
// 	type _checkCos = ValidateRecursiveSchema<typeof Cos>;
// 	type _checkTan = ValidateRecursiveSchema<typeof Tan>;
// 	type _checkAtan2 = ValidateRecursiveSchema<typeof Atan2>;
// 	type _checkAbs = ValidateRecursiveSchema<typeof Abs>;
// 	type _checkRound = ValidateRecursiveSchema<typeof Round>;
// 	type _checkFloor = ValidateRecursiveSchema<typeof Floor>;
// 	type _checkCeil = ValidateRecursiveSchema<typeof Ceil>;
// 	type _checkBitwiseAnd = ValidateRecursiveSchema<typeof BitwiseAnd>;
// 	type _checkBitwiseOr = ValidateRecursiveSchema<typeof BitwiseOr>;
// 	type _checkBitwiseXor = ValidateRecursiveSchema<typeof BitwiseXor>;
// 	type _checkBitwiseLeftShift = ValidateRecursiveSchema<typeof BitwiseLeftShift>;
// 	type _checkBitwiseRightShift = ValidateRecursiveSchema<typeof BitwiseRightShift>;
// 	type _checkBitwiseUnsignedRightShift = ValidateRecursiveSchema<
// 		typeof BitwiseUnsignedRightShift
// 	>;
// 	type _checkMin = ValidateRecursiveSchema<typeof Min>;
// 	type _checkMax = ValidateRecursiveSchema<typeof Max>;
// 	type _checkLength = ValidateRecursiveSchema<typeof Length>;
// 	type _checkArrayItems = ValidateRecursiveSchema<typeof ArrayItems>;
// 	type _checkArrayLiteral = ValidateRecursiveSchema<typeof ArrayLiteral>;
// 	type _checkProperties = ValidateRecursiveSchema<typeof Properties>;
// 	type _checkObjectLiteral = ValidateRecursiveSchema<typeof ObjectLiteral>;
// 	type _checkStatements = ValidateRecursiveSchema<typeof Statements>;
// 	type _checkStatementBlock = ValidateRecursiveSchema<typeof StatementBlock>;
// 	type _checkExpressionBlock = ValidateRecursiveSchema<typeof ExpressionBlock>;
// 	type _checkConditionalExpression = ValidateRecursiveSchema<typeof ConditionalExpression>;
// 	type _checkArguments = ValidateRecursiveSchema<typeof Arguments>;
// 	type _checkFunctionCall = ValidateRecursiveSchema<typeof FunctionCall>;
// 	type _checkProperty = ValidateRecursiveSchema<typeof Property>;
// 	type _checkIndex = ValidateRecursiveSchema<typeof Index>;
// 	type _checkAppend = ValidateRecursiveSchema<typeof Append>;
// 	type _checkAssignment = ValidateRecursiveSchema<typeof Assignment>;
// 	type _checkVariableDef = ValidateRecursiveSchema<typeof VariableDef>;
// 	type _checkProcedureCall = ValidateRecursiveSchema<typeof ProcedureCall>;
// 	type _checkIfStatement = ValidateRecursiveSchema<typeof IfStatement>;
// 	type _checkWhileLoop = ValidateRecursiveSchema<typeof WhileLoop>;
// 	type _checkReturnStatement = ValidateRecursiveSchema<typeof ReturnStatement>;
// 	type _checkFunctionDef = ValidateRecursiveSchema<typeof FunctionDef>;
// 	type _checkProcedureDef = ValidateRecursiveSchema<typeof ProcedureDef>;
// 	type _checkCoordinates = ValidateRecursiveSchema<typeof Coordinates>;
// 	type _checkPoint = ValidateRecursiveSchema<typeof Point>;
// 	type _checkColorLiteral = ValidateRecursiveSchema<typeof ColorLiteral>;
// 	type _checkDrawCircle = ValidateRecursiveSchema<typeof DrawCircle>;
// 	type _checkDrawingStatements = ValidateRecursiveSchema<typeof DrawingStatements>;
// 	type _checkDrawingBlock = ValidateRecursiveSchema<typeof DrawingBlock>;
// 	type _checkDrawingProcedureDef = ValidateRecursiveSchema<typeof DrawingProcedureDef>;
// 	type _checkDrawingIfStatement = ValidateRecursiveSchema<typeof DrawingIfStatement>;
// 	type _checkAnimationWhileLoop = ValidateRecursiveSchema<typeof AnimationWhileLoop>;
// 	type _checkAnimationDefinitions = ValidateRecursiveSchema<typeof AnimationDefinitions>;
// 	type _checkAnimationDefinitionBlock = ValidateRecursiveSchema<
// 		typeof AnimationDefinitionBlock
// 	>;
// 	type _checkExpressionProgram = ValidateRecursiveSchema<typeof ExpressionProgram>;
// 	type _checkDrawingProgram = ValidateRecursiveSchema<typeof DrawingProgram>;
// 	type _checkAnimation = ValidateRecursiveSchema<typeof Animation>;
// 	type _checkAnimationProgram = ValidateRecursiveSchema<typeof AnimationProgram>;
// }
