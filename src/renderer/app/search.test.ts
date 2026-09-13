import assert from "node:assert/strict";
import test from "node:test";
import { currentLocalDate, currentLocalMonth } from "../../shared/domain";
import { validateLedgerSearch } from "./search";

test("statistics search state derives a local anchor without UTC guessing", () => {
  const currentMonth = currentLocalMonth();
  assert.deepEqual(validateLedgerSearch({ month: currentMonth }), {
    month: currentMonth,
    anchor: currentLocalDate(),
  });
  assert.deepEqual(validateLedgerSearch({ month: "2024-02" }), {
    month: "2024-02",
    anchor: "2024-02-01",
  });
  assert.deepEqual(
    validateLedgerSearch({ anchor: "2024-02-29", period: "year", unknown: "ignored" }),
    { month: "2024-02", anchor: "2024-02-29", period: "year" },
  );
  assert.deepEqual(
    validateLedgerSearch({ month: "2024-02", anchor: "2024-03-01", period: "week" }),
    { month: "2024-02", anchor: "2024-02-01", period: "week" },
  );
});
