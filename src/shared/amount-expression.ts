import { DomainError, parseMinorUnits } from './domain';

export const MAX_AMOUNT_EXPRESSION_LENGTH = 256;
export const MAX_AMOUNT_EXPRESSION_OPERANDS = 32;

export type AmountExpressionOperator = '+' | '-';

export type AmountExpressionErrorCode =
  | 'amount-expression-invalid'
  | 'amount-expression-incomplete'
  | 'amount-expression-too-long'
  | 'amount-expression-too-many-operands';

export class AmountExpressionError extends Error {
  constructor(readonly code: AmountExpressionErrorCode, message: string) {
    super(message);
    this.name = 'AmountExpressionError';
  }
}

export interface AmountExpressionState {
  expression: string;
  amountMinor: string | null;
  operandCount: number;
  complete: boolean;
}

interface ParsedExpression {
  operands: string[];
  operators: AmountExpressionOperator[];
  complete: boolean;
}

/**
 * Normalise the small keypad language while the user is typing.
 *
 * The expression never becomes an evaluator program: only decimal operands
 * and binary plus/minus operators survive. Repeated decimal points are
 * ignored and repeated operators replace the previous operator, which keeps
 * a draft recoverable without silently evaluating it.
 */
export function normalizeAmountExpressionInput(value: string): string {
  assertExpressionLength(value);
  let result = '';
  let operandHasDecimal = false;

  for (const character of value) {
    if (character >= '0' && character <= '9') {
      result += character;
      continue;
    }
    if (character === '.') {
      if (operandHasDecimal) continue;
      if (result.length === 0 || /[+-]$/.test(result)) result += '0';
      result += '.';
      operandHasDecimal = true;
      continue;
    }
    if (character === '+' || character === '-') {
      if (result.length === 0) {
        throw invalidExpression('An expression must start with a number.');
      }
      if (result.endsWith('.')) {
        result += '0';
      }
      if (result.endsWith('+') || result.endsWith('-')) {
        result = `${result.slice(0, -1)}${character}`;
      } else {
        result += character;
      }
      operandHasDecimal = false;
      continue;
    }
    throw invalidExpression('Use numbers, a decimal point, plus, or minus.');
  }

  return result;
}

/** Evaluate the complete expression with integer minor-unit arithmetic. */
export function evaluateAmountExpression(
  expression: string,
  precision: number,
): string {
  const parsed = parseExpression(expression);
  if (!parsed.complete) {
    throw new AmountExpressionError(
      'amount-expression-incomplete',
      'Finish the expression before evaluating it.',
    );
  }
  const values = parsed.operands.map((operand) => decimalOperandToMinorUnits(operand, precision));
  let result = values[0] ?? 0n;
  for (let index = 0; index < parsed.operators.length; index += 1) {
    const operator = parsed.operators[index];
    const value = values[index + 1];
    if (operator === undefined || value === undefined) {
      throw new AmountExpressionError(
        'amount-expression-invalid',
        'The expression contains an invalid operator.',
      );
    }
    result = operator === '+' ? result + value : result - value;
  }
  return result.toString();
}

/** Return a UI-friendly state without turning an incomplete draft into zero. */
export function inspectAmountExpression(
  expression: string,
  precision: number,
): AmountExpressionState {
  const parsed = parseExpression(expression);
  if (!parsed.complete) {
    return {
      expression,
      amountMinor: null,
      operandCount: parsed.operands.length,
      complete: false,
    };
  }
  return {
    expression,
    amountMinor: evaluateAmountExpression(expression, precision),
    operandCount: parsed.operands.length,
    complete: true,
  };
}

function parseExpression(expression: string): ParsedExpression {
  if (typeof expression !== 'string' || expression.length === 0) {
    throw invalidExpression('Enter an amount.');
  }
  assertExpressionLength(expression);

  const operands: string[] = [];
  const operators: AmountExpressionOperator[] = [];
  let operand = '';
  let hasDecimal = false;

  for (const character of expression) {
    if (character >= '0' && character <= '9') {
      operand += character;
      continue;
    }
    if (character === '.') {
      if (hasDecimal) throw invalidExpression('An amount can contain one decimal point.');
      hasDecimal = true;
      operand += character;
      continue;
    }
    if (character === '+' || character === '-') {
      if (operand.length === 0 || operand === '.') {
        throw invalidExpression('Each operator must follow an amount.');
      }
      operands.push(operand);
      operators.push(character);
      operand = '';
      hasDecimal = false;
      continue;
    }
    throw invalidExpression('Use numbers, a decimal point, plus, or minus.');
  }

  if (operand.length > 0 && operand !== '.') operands.push(operand);
  const complete = operand.length > 0 && operand !== '.';
  if (operands.length > MAX_AMOUNT_EXPRESSION_OPERANDS) {
    throw new AmountExpressionError(
      'amount-expression-too-many-operands',
      `An expression can contain at most ${MAX_AMOUNT_EXPRESSION_OPERANDS} amounts.`,
    );
  }
  if (!complete && operands.length === 0) {
    throw new AmountExpressionError(
      'amount-expression-incomplete',
      'Enter an amount before evaluating it.',
    );
  }
  return { operands, operators, complete };
}

function decimalOperandToMinorUnits(value: string, precision: number): bigint {
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) {
    throw new DomainError('invalid-workspace', 'Precision must be an integer from 0 to 4.');
  }
  if (!/^\d+(?:\.\d*)?$/.test(value)) {
    throw invalidExpression('Each amount must be a non-negative decimal.');
  }
  const [whole, fraction = ''] = value.split('.');
  const extraFraction = fraction.slice(precision);
  if (extraFraction.length > 0 && /[^0]/.test(extraFraction)) {
    throw new DomainError(
      'invalid-amount',
      `This workspace supports at most ${precision} decimal places.`,
    );
  }
  return parseMinorUnits(`${whole}${fraction.slice(0, precision).padEnd(precision, '0')}`);
}

function assertExpressionLength(value: string): void {
  if (value.length > MAX_AMOUNT_EXPRESSION_LENGTH) {
    throw new AmountExpressionError(
      'amount-expression-too-long',
      `An expression can contain at most ${MAX_AMOUNT_EXPRESSION_LENGTH} characters.`,
    );
  }
}

function invalidExpression(message: string): AmountExpressionError {
  return new AmountExpressionError('amount-expression-invalid', message);
}
