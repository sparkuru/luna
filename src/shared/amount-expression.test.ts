import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AmountExpressionError,
  evaluateAmountExpression,
  inspectAmountExpression,
  normalizeAmountExpressionInput,
} from './amount-expression';

test('evaluates decimal addition and subtraction with exact minor units', () => {
  assert.equal(evaluateAmountExpression('0.1+0.2', 2), '30');
  assert.equal(evaluateAmountExpression('12-2+0.5', 2), '1050');
  assert.equal(evaluateAmountExpression('4-8', 2), '-400');
  assert.equal(evaluateAmountExpression('1.2300', 2), '123');
});

test('uses standard precedence for multiplication and division', () => {
  assert.equal(evaluateAmountExpression('2*3+4', 2), '1000');
  assert.equal(evaluateAmountExpression('2+3*4', 2), '1400');
  assert.equal(evaluateAmountExpression('12/3*2', 2), '800');
  assert.equal(evaluateAmountExpression('2×3+4', 2), '1000');
});

test('normalizes multiplication and division display glyphs', () => {
  assert.equal(normalizeAmountExpressionInput('2×3÷.5'), '2*3/0.5');
  assert.equal(normalizeAmountExpressionInput('12+÷2'), '12/2');
  assert.equal(normalizeAmountExpressionInput('12*×2'), '12*2');
});

test('inspects finite and repeating results separately from ledger rounding', () => {
  const finite = inspectAmountExpression('1/4', 2);
  assert.equal(finite.amountMinor, '25');
  assert.equal(finite.displayAmount, '0.25');
  assert.equal(finite.displayPrecision, 2);
  assert.equal(finite.roundingDigit, null);

  const repeating = inspectAmountExpression('10/3', 2);
  assert.equal(repeating.amountMinor, '333');
  assert.equal(repeating.displayAmount, '3.33(3)');
  assert.equal(repeating.displayPrecision, 2);
  assert.equal(repeating.roundingDigit, '3');

  const higherPrecision = inspectAmountExpression('10/3', 4);
  assert.equal(higherPrecision.amountMinor, '33333');
  assert.equal(higherPrecision.displayAmount, '3.3333(3)');
  assert.equal(higherPrecision.displayPrecision, 4);

  const padded = inspectAmountExpression('189', 2);
  assert.equal(padded.amountMinor, '18900');
  assert.equal(padded.displayAmount, '189.00');
  assert.equal(padded.roundingDigit, null);

  const zeroPrecision = inspectAmountExpression('10/3', 0);
  assert.equal(zeroPrecision.amountMinor, '3');
  assert.equal(zeroPrecision.displayAmount, '3(3)');
  assert.equal(zeroPrecision.displayPrecision, 0);
});

test('rounds rational results half-up, including signed results', () => {
  assert.equal(evaluateAmountExpression('1/40', 2), '3');
  assert.equal(evaluateAmountExpression('0-1/40', 2), '-3');
  assert.equal(inspectAmountExpression('1/8', 2).displayAmount, '0.12(5)');
  assert.equal(inspectAmountExpression('0-10/3', 2).displayAmount, '-3.33(3)');
});

test('keeps division by zero and unsupported syntax typed and recoverable', () => {
  assert.throws(
    () => evaluateAmountExpression('10/0', 2),
    (error: unknown) =>
      error instanceof AmountExpressionError &&
      error.code === 'amount-expression-division-by-zero',
  );
  assert.throws(
    () => evaluateAmountExpression('2/', 2),
    (error: unknown) =>
      error instanceof AmountExpressionError &&
      error.code === 'amount-expression-incomplete',
  );
  assert.throws(() => evaluateAmountExpression('2*(3)', 2), AmountExpressionError);
});

test('keeps incomplete drafts distinct from a zero result', () => {
  assert.deepEqual(inspectAmountExpression('12+', 2), {
    expression: '12+',
    amountMinor: null,
    operandCount: 1,
    complete: false,
  });
  assert.throws(
    () => evaluateAmountExpression('12+', 2),
    (error: unknown) => error instanceof AmountExpressionError && error.code === 'amount-expression-incomplete',
  );
  assert.equal(inspectAmountExpression('0', 2).amountMinor, '0');
});

test('normalizes keypad corrections without using an evaluator', () => {
  assert.equal(normalizeAmountExpressionInput('.1..2++-.3'), '0.12-0.3');
  assert.equal(normalizeAmountExpressionInput('12+--2'), '12-2');
  assert.throws(() => normalizeAmountExpressionInput('+1'), /start with a number/);
  assert.throws(() => normalizeAmountExpressionInput('1a'), /numbers/);
});

test('enforces precision, expression length, and operand count limits', () => {
  assert.throws(() => evaluateAmountExpression('1.001', 2), /decimal places/);
  assert.throws(() => evaluateAmountExpression('1+'.repeat(32) + '1', 2), /at most 32/);
  assert.throws(() => evaluateAmountExpression('1'.repeat(257), 2), /256 characters/);
});
