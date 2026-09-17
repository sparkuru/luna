import { DomainError } from './domain';

export const MAX_AMOUNT_EXPRESSION_LENGTH = 256;
export const MAX_AMOUNT_EXPRESSION_OPERANDS = 32;
/**
 * Keep pathological rational expressions bounded even though BigInt itself is
 * unbounded. The expression length and operand limits still provide the
 * normal user-facing bounds; this limit protects the intermediate fraction.
 */
export const MAX_AMOUNT_EXPRESSION_RATIONAL_DIGITS = 512;

export type AmountExpressionOperator = '+' | '-' | '*' | '/';

export type AmountExpressionErrorCode =
  | 'amount-expression-invalid'
  | 'amount-expression-incomplete'
  | 'amount-expression-too-long'
  | 'amount-expression-too-many-operands'
  | 'amount-expression-division-by-zero'
  | 'amount-expression-out-of-range';

export class AmountExpressionError extends Error {
  constructor(readonly code: AmountExpressionErrorCode, message: string) {
    super(message);
    this.name = 'AmountExpressionError';
  }
}

export interface AmountExpressionState {
  expression: string;
  /** The canonical, ledger-precision minor-unit result when complete. */
  amountMinor: string | null;
  operandCount: number;
  complete: boolean;
  /** A non-submittable display using the workspace precision. A next digit
   * in parentheses marks a result that continues beyond that precision.
   *
   * These fields are omitted for incomplete drafts to preserve the original
   * inspect result shape for existing callers.
   */
  displayAmount?: string;
  displayPrecision?: number;
  roundingDigit?: string | null;
}

interface ParsedExpression {
  operands: string[];
  operators: AmountExpressionOperator[];
  complete: boolean;
}

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

interface EvaluatedAmountExpression {
  amountMinor: string;
  displayAmount: string;
  displayPrecision: number;
  roundingDigit: string | null;
}

/**
 * Normalise the small keypad language while the user is typing.
 *
 * The expression never becomes an evaluator program: only decimal operands
 * and binary plus/minus/multiply/divide operators survive. The multiplication
 * and division glyphs are presentation aliases for the canonical `*` and
 * `/` tokens. Repeated decimal points are ignored and repeated operators
 * replace the previous operator, which keeps a draft recoverable without
 * silently evaluating it.
 */
export function normalizeAmountExpressionInput(value: string): string {
  if (typeof value !== 'string') {
    throw invalidExpression('Use numbers, a decimal point, and arithmetic operators.');
  }
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
      if (result.length === 0 || endsWithOperator(result)) result += '0';
      result += '.';
      operandHasDecimal = true;
      continue;
    }
    const operator = canonicalOperator(character);
    if (operator !== undefined) {
      if (result.length === 0) {
        throw invalidExpression('An expression must start with a number.');
      }
      if (result.endsWith('.')) {
        result += '0';
      }
      if (endsWithOperator(result)) {
        result = `${result.slice(0, -1)}${operator}`;
      } else {
        result += operator;
      }
      operandHasDecimal = false;
      continue;
    }
    throw invalidExpression(
      'Use numbers, a decimal point, and arithmetic operators.',
    );
  }

  return result;
}

/** Evaluate a complete expression and return canonical ledger minor units. */
export function evaluateAmountExpression(
  expression: string,
  precision: number,
): string {
  const parsed = parseExpression(expression);
  if (!parsed.complete) {
    throw incompleteExpression();
  }
  return evaluateParsedExpression(parsed, precision).amountMinor;
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

  const evaluated = evaluateParsedExpression(parsed, precision);
  return {
    expression,
    amountMinor: evaluated.amountMinor,
    operandCount: parsed.operands.length,
    complete: true,
    displayAmount: evaluated.displayAmount,
    displayPrecision: evaluated.displayPrecision,
    roundingDigit: evaluated.roundingDigit,
  };
}

function evaluateParsedExpression(
  parsed: ParsedExpression,
  precision: number,
): EvaluatedAmountExpression {
  assertPrecision(precision);
  const values = parsed.operands.map((operand) => decimalOperandToRational(operand, precision));
  const result = evaluateRationalExpression(values, parsed.operators);
  const amountMinor = roundRationalToMinorUnits(result, precision).toString();
  const displayPrecision = precision;
  const display = formatRational(result, displayPrecision);

  return {
    amountMinor,
    displayAmount: display.value,
    displayPrecision,
    roundingDigit: display.roundingDigit,
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

  // The keypad stores ASCII operators. Accepting the two visual aliases here
  // as well keeps the public evaluator safe when called directly by a host.
  for (const character of expression) {
    const canonicalCharacter = canonicalOperator(character) ?? character;
    if (canonicalCharacter >= '0' && canonicalCharacter <= '9') {
      operand += canonicalCharacter;
      continue;
    }
    if (canonicalCharacter === '.') {
      if (hasDecimal) {
        throw invalidExpression('An amount can contain one decimal point.');
      }
      hasDecimal = true;
      operand += canonicalCharacter;
      continue;
    }
    if (isAmountExpressionOperator(canonicalCharacter)) {
      if (operand.length === 0 || operand === '.') {
        throw invalidExpression('Each operator must follow an amount.');
      }
      operands.push(operand);
      operators.push(canonicalCharacter);
      operand = '';
      hasDecimal = false;
      continue;
    }
    throw invalidExpression(
      'Use numbers, a decimal point, and arithmetic operators.',
    );
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

function decimalOperandToRational(value: string, precision: number): Rational {
  assertPrecision(precision);
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

  // Trailing zeroes do not affect the value and dropping them keeps the
  // denominator small before multiplication and division begin.
  const significantFraction = fraction.replace(/0+$/, '');
  const digits = `${whole}${significantFraction}`;
  const denominator = 10n ** BigInt(significantFraction.length);
  return makeRational(BigInt(digits), denominator);
}

function evaluateRationalExpression(
  values: readonly Rational[],
  operators: readonly AmountExpressionOperator[],
): Rational {
  const first = values[0];
  if (first === undefined) {
    throw invalidExpression('Enter an amount.');
  }

  const valueStack: Rational[] = [first];
  const operatorStack: AmountExpressionOperator[] = [];
  for (let index = 0; index < operators.length; index += 1) {
    const operator = operators[index];
    const value = values[index + 1];
    if (operator === undefined || value === undefined) {
      throw invalidExpression('The expression contains an invalid operator.');
    }

    while (operatorStack.length > 0) {
      const previousOperator = operatorStack[operatorStack.length - 1];
      if (
        previousOperator === undefined ||
        precedence(previousOperator) < precedence(operator)
      ) {
        break;
      }
      applyTopOperation(valueStack, operatorStack);
    }
    operatorStack.push(operator);
    valueStack.push(value);
  }

  while (operatorStack.length > 0) {
    applyTopOperation(valueStack, operatorStack);
  }
  const result = valueStack[0];
  if (result === undefined || valueStack.length !== 1) {
    throw invalidExpression('The expression contains an invalid operator.');
  }
  return result;
}

function applyTopOperation(
  valueStack: Rational[],
  operatorStack: AmountExpressionOperator[],
): void {
  const operator = operatorStack.pop();
  const right = valueStack.pop();
  const left = valueStack.pop();
  if (operator === undefined || left === undefined || right === undefined) {
    throw invalidExpression('The expression contains an invalid operator.');
  }
  valueStack.push(applyOperation(left, operator, right));
}

function applyOperation(
  left: Rational,
  operator: AmountExpressionOperator,
  right: Rational,
): Rational {
  switch (operator) {
    case '+':
      return makeRational(
        left.numerator * right.denominator + right.numerator * left.denominator,
        left.denominator * right.denominator,
      );
    case '-':
      return makeRational(
        left.numerator * right.denominator - right.numerator * left.denominator,
        left.denominator * right.denominator,
      );
    case '*':
      return makeRational(
        left.numerator * right.numerator,
        left.denominator * right.denominator,
      );
    case '/':
      if (right.numerator === 0n) {
        throw new AmountExpressionError(
          'amount-expression-division-by-zero',
          'Cannot divide by zero.',
        );
      }
      return makeRational(
        left.numerator * right.denominator,
        left.denominator * right.numerator,
      );
  }
}

function makeRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) {
    throw new AmountExpressionError(
      'amount-expression-division-by-zero',
      'Cannot divide by zero.',
    );
  }
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };

  const positiveDenominator = denominator < 0n ? -denominator : denominator;
  const positiveNumerator = denominator < 0n ? -numerator : numerator;
  const divisor = greatestCommonDivisor(
    absoluteValue(positiveNumerator),
    positiveDenominator,
  );
  const normalized = {
    numerator: positiveNumerator / divisor,
    denominator: positiveDenominator / divisor,
  };
  if (
    digitLength(normalized.numerator) > MAX_AMOUNT_EXPRESSION_RATIONAL_DIGITS ||
    digitLength(normalized.denominator) > MAX_AMOUNT_EXPRESSION_RATIONAL_DIGITS
  ) {
    throw new AmountExpressionError(
      'amount-expression-out-of-range',
      'The expression result is too large to calculate safely.',
    );
  }
  return normalized;
}

function roundRationalToMinorUnits(value: Rational, precision: number): bigint {
  const scale = 10n ** BigInt(precision);
  const scaledNumerator = value.numerator * scale;
  const negative = scaledNumerator < 0n;
  const magnitude = absoluteValue(scaledNumerator);
  let rounded = magnitude / value.denominator;
  const remainder = magnitude % value.denominator;
  // Half-up is applied to the magnitude, so negative values round away from
  // zero at an exact half while retaining the existing signed-result model.
  if (remainder * 2n >= value.denominator) rounded += 1n;
  const result = negative ? -rounded : rounded;
  if (digitLength(result) > MAX_AMOUNT_EXPRESSION_RATIONAL_DIGITS) {
    throw new AmountExpressionError(
      'amount-expression-out-of-range',
      'The expression result is too large to store as an amount.',
    );
  }
  return result;
}

function formatRational(
  value: Rational,
  displayPrecision: number,
): { value: string; roundingDigit: string | null } {
  const negative = value.numerator < 0n;
  const numerator = absoluteValue(value.numerator);
  const integer = numerator / value.denominator;
  let remainder = numerator % value.denominator;
  let fraction = '';

  for (let index = 0; index < displayPrecision; index += 1) {
    remainder *= 10n;
    const digit = remainder / value.denominator;
    remainder %= value.denominator;
    fraction += digit.toString();
  }

  const roundingDigit =
    remainder === 0n
      ? null
      : ((remainder * 10n) / value.denominator).toString();
  const sign = negative ? '-' : '';
  const decimal = displayPrecision > 0 ? `.${fraction}` : '';
  return {
    value: `${sign}${integer.toString()}${decimal}${roundingDigit === null ? '' : `(${roundingDigit})`}`,
    roundingDigit,
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function absoluteValue(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function digitLength(value: bigint): number {
  return absoluteValue(value).toString().length;
}

function precedence(operator: AmountExpressionOperator): number {
  return operator === '+' || operator === '-' ? 1 : 2;
}

function canonicalOperator(character: string): AmountExpressionOperator | undefined {
  if (character === '×') return '*';
  if (character === '÷') return '/';
  return isAmountExpressionOperator(character) ? character : undefined;
}

function isAmountExpressionOperator(
  character: string,
): character is AmountExpressionOperator {
  return character === '+' || character === '-' || character === '*' || character === '/';
}

function endsWithOperator(value: string): boolean {
  const character = value[value.length - 1];
  return character !== undefined && isAmountExpressionOperator(character);
}

function assertPrecision(precision: number): void {
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) {
    throw new DomainError('invalid-workspace', 'Precision must be an integer from 0 to 4.');
  }
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

function incompleteExpression(): AmountExpressionError {
  return new AmountExpressionError(
    'amount-expression-incomplete',
    'Finish the expression before evaluating it.',
  );
}
