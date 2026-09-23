import assert from "node:assert/strict";
import test from "node:test";
import {
  settingsAreaDefinitions,
  settingsAreaGroups,
  settingsNavigationItems,
} from "./features/settings-navigation";

test("settings catalog filters Web-only budget from native navigation", () => {
  assert.equal(
    settingsAreaDefinitions(false).some((area) => area.key === "budget"),
    false,
  );
  assert.equal(
    settingsAreaDefinitions(true).some((area) => area.key === "budget"),
    true,
  );
  assert.equal(
    settingsNavigationItems(false).some((item) => item.path === "/budget"),
    false,
  );
  assert.equal(
    settingsNavigationItems(true).some((item) => item.path === "/budget"),
    true,
  );
});

test("settings catalog keeps the shared grouped task order", () => {
  assert.deepEqual(
    settingsAreaGroups(true).map((group) => [
      group.key,
      group.areas.map((area) => area.key),
    ]),
    [
      ["workspace", ["ledgers", "categories", "preferences", "budget"]],
      ["access", ["account", "sync", "advanced"]],
      ["data", ["backup", "conflicts"]],
    ],
  );
  assert.deepEqual(
    settingsAreaGroups(false).map((group) => [
      group.key,
      group.areas.map((area) => area.key),
    ]),
    [
      ["workspace", ["ledgers", "categories", "preferences"]],
      ["access", ["account", "sync", "advanced"]],
      ["data", ["backup", "conflicts"]],
    ],
  );
});
