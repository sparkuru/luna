import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { createApp } from "../app";
import { createDatabase } from "../config";
import { migrate } from "../db/migration";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, stable(v)]),
    );
  return value;
}
async function files(
  path: string,
  prefix = "",
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = join(prefix, entry.name);
    if (entry.isDirectory())
      Object.assign(result, await files(join(path, entry.name), name));
    else result[name] = await readFile(join(path, entry.name), "utf8");
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}
function normalizeGeneratedText(value: string): string {
  return value.replace(/[ \t]+(?=\r\n|\n|\r|$)/g, "");
}
async function normalizeGeneratedFiles(output: string): Promise<void> {
  for (const [name, content] of Object.entries(await files(output))) {
    const normalized = normalizeGeneratedText(content);
    if (normalized !== content)
      await writeFile(join(output, name), normalized);
  }
}
/** Hey's bundled runtime uses explicit undefined for optional fields. Compile only
 * that upstream runtime to JS/declarations; SDK/types/Query and all application
 * sources retain the repository's exactOptionalPropertyTypes checking. */
async function compileVendorRuntime(output: string): Promise<void> {
  const names = Object.keys(await files(output)).filter(
    (name) =>
      (name.startsWith("client/") || name.startsWith("core/")) &&
      name.endsWith(".ts"),
  );
  const rootNames = names.map((name) => resolve(output, name));
  const program = ts.createProgram(rootNames, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: false,
    skipLibCheck: true,
    declaration: true,
    noEmitOnError: true,
    rootDir: resolve(output),
  });
  const result = program.emit();
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...result.diagnostics,
  ];
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      }),
    );
  for (const name of rootNames) await rm(name);
}
async function main() {
  const { createClient } = await import("@hey-api/openapi-ts");
  const check = process.argv.includes("--check");
  const scratch = await mkdtemp(join(tmpdir(), "luna-api-"));
  const database = createDatabase(":memory:");
  await migrate(database);
  const app = await createApp({ database });
  try {
    const contract = JSON.stringify(stable(app.swagger()), null, 2) + "\n";
    const input = join(scratch, "openapi.json");
    await writeFile(input, contract);
    const output = check
      ? join(scratch, "generated")
      : "src/api-client/generated";
    await createClient({
      input,
      output,
      plugins: [
        "@hey-api/typescript",
        "@hey-api/sdk",
        "@hey-api/client-fetch",
        {
          name: "@tanstack/react-query",
          queryOptions: true,
          mutationOptions: false,
        },
      ],
    });
    await compileVendorRuntime(output);
    await normalizeGeneratedFiles(output);
    if (check) {
      if (contract !== (await readFile("contracts/openapi.json", "utf8")))
        throw new Error("OpenAPI differs");
      if (
        JSON.stringify(await files(output)) !==
        JSON.stringify(await files("src/api-client/generated"))
      )
        throw new Error("Generated SDK differs");
      console.log("LUNA_API_REPRODUCIBLE");
    } else {
      await mkdir("contracts", { recursive: true });
      await writeFile("contracts/openapi.json", contract);
    }
  } finally {
    await app.close();
    database.close();
    await rm(scratch, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
