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
