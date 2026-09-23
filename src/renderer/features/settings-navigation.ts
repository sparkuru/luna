import type { MessageKey } from "../i18n";

export type SettingsAreaKey =
  | "settings"
  | "ledgers"
  | "categories"
  | "preferences"
  | "account"
  | "sync"
  | "advanced"
  | "backup"
  | "conflicts"
  | "budget";

export type SettingsAreaGroupKey = "workspace" | "access" | "data";

export type SettingsAreaDefinition = {
  key: Exclude<SettingsAreaKey, "settings">;
  path: string;
  titleKey: MessageKey;
  helpKey: MessageKey;
  group: SettingsAreaGroupKey;
  webOnly?: boolean;
};

export type SettingsNavigationItem = {
  key: SettingsAreaKey;
  path: string;
  titleKey: MessageKey;
};

export const SETTINGS_HOME_ITEM: SettingsNavigationItem = {
  key: "settings",
  path: "/settings",
  titleKey: "settingsTitle",
};

export const SETTINGS_AREA_DEFINITIONS = [
  {
    key: "ledgers",
    path: "/settings/ledgers",
    titleKey: "ledgersTitle",
    helpKey: "ledgersHelp",
    group: "workspace",
  },
  {
    key: "categories",
    path: "/settings/categories",
    titleKey: "categoriesTitle",
    helpKey: "categoriesHelp",
    group: "workspace",
  },
  {
    key: "preferences",
    path: "/settings/preferences",
    titleKey: "preferencesTitle",
    helpKey: "preferencesHelp",
    group: "workspace",
  },
  {
    key: "account",
    path: "/settings/account",
    titleKey: "accountTitle",
    helpKey: "accountUnavailable",
    group: "access",
  },
  {
    key: "sync",
    path: "/settings/sync",
    titleKey: "ledgerToolsLink",
    helpKey: "ledgerToolsSummary",
    group: "access",
  },
  {
    key: "advanced",
    path: "/settings/sync/advanced",
    titleKey: "advancedSettingsTitle",
    helpKey: "advancedSettingsHelp",
    group: "access",
  },
  {
    key: "backup",
    path: "/settings/backup",
    titleKey: "backupNav",
    helpKey: "backupHelp",
    group: "data",
  },
  {
    key: "conflicts",
    path: "/settings/conflicts",
    titleKey: "conflictsNav",
    helpKey: "conflictsHelp",
    group: "data",
  },
  {
    key: "budget",
    path: "/budget",
    titleKey: "monthlyLimit",
    helpKey: "budgetSettingsHelp",
    group: "workspace",
    webOnly: true,
  },
] as const satisfies readonly SettingsAreaDefinition[];

const SETTINGS_AREA_GROUPS: readonly {
  key: SettingsAreaGroupKey;
  labelKey: MessageKey;
  areaKeys: readonly SettingsAreaDefinition["key"][];
}[] = [
  {
    key: "workspace",
    labelKey: "settingsGroupWorkspace",
    areaKeys: ["ledgers", "categories", "preferences", "budget"],
  },
  {
    key: "access",
    labelKey: "settingsGroupAccess",
    areaKeys: ["account", "sync", "advanced"],
  },
  {
    key: "data",
    labelKey: "settingsGroupData",
    areaKeys: ["backup", "conflicts"],
  },
];

export function settingsAreaDefinitions(web: boolean): SettingsAreaDefinition[] {
  return SETTINGS_AREA_DEFINITIONS.filter(
    (area) => !("webOnly" in area) || !area.webOnly || web,
  );
}

export function settingsAreaGroups(web: boolean): {
  key: SettingsAreaGroupKey;
  labelKey: MessageKey;
  areas: SettingsAreaDefinition[];
}[] {
  const available = settingsAreaDefinitions(web);
  return SETTINGS_AREA_GROUPS.map((group) => ({
    key: group.key,
    labelKey: group.labelKey,
    areas: group.areaKeys
      .map((key) => available.find((area) => area.key === key))
      .filter((area): area is SettingsAreaDefinition => area !== undefined),
  })).filter((group) => group.areas.length > 0);
}

export function settingsNavigationItems(web: boolean): SettingsNavigationItem[] {
  return [
    SETTINGS_HOME_ITEM,
    ...settingsAreaDefinitions(web).map(({ key, path, titleKey }) => ({
      key,
      path,
      titleKey,
    })),
  ];
}
