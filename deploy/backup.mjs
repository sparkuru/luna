import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

function command(name, args) {
  const result = spawnSync(name, args, { encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Backup ${name} command failed`);
  return result.stdout;
}

function overlaps(a, b) {
  const path = relative(a, b);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep));
}

function assertStopped(source) {
  const ids = command("docker", ["ps", "--quiet"]).trim().split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const mounts = JSON.parse(command("docker", ["inspect", "--format", "{{json .Mounts}}", id]));
    for (const mount of mounts) {
      if (mount.Type !== "bind" && mount.Type !== "volume") continue;
      // Docker supplies canonical host paths for volumes; their parent is root-only.
      const mounted = mount.Type === "volume" ? resolve(mount.Source) : realpathSync(mount.Source);
      if (overlaps(source, mounted) || overlaps(mounted, source))
        throw new Error("Backup refused: a running container mounts the data boundary; stop all writers first");
    }
  }
}

function assertLocalDaemon() {
  // Refuse ambiguous remote overrides even if a selected context could ignore them.
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix:///"))
    throw new Error("Backup refused: use a local Unix-socket Docker daemon on the data host");
  const endpoint = command("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]).trim();
  if (!endpoint.startsWith("unix:///"))
    throw new Error("Backup refused: use a local Unix-socket Docker daemon on the data host");
}

function assertTree(path) {
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) assertTree(join(path, entry));
  } else if (!stat.isFile()) {
    throw new Error("Backup refused: data contains a symbolic link or special file");
  }
}

function backup(sourceArgument, destinationArgument) {
  assertLocalDaemon();
  const source = realpathSync(sourceArgument);
  const destination = join(realpathSync(dirname(resolve(destinationArgument))), basename(resolve(destinationArgument)));
  if (overlaps(source, destination) || overlaps(destination, source))
    throw new Error("Backup destination must be separate from the source data");
  const rootStat = lstatSync(source);
  if (!rootStat.isDirectory() || (rootStat.mode & 0o777) !== 0o700)
    throw new Error("Backup refused: invalid data directory permissions");
  const stateStat = lstatSync(join(source, ".luna"));
  if (!stateStat.isDirectory() || (stateStat.mode & 0o777) !== 0o700 || stateStat.uid !== rootStat.uid || stateStat.gid !== rootStat.gid)
    throw new Error("Backup refused: invalid initialization directory permissions");
  for (const name of ["initialized", "bucket-initialized", "runtime.json", "minio.env"]) {
    const file = join(source, ".luna", name);
    const stat = lstatSync(file);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== rootStat.uid || stat.gid !== rootStat.gid)
      throw new Error("Backup refused: invalid initialization or secret permissions");
    if (name.endsWith("initialized") && readFileSync(file, "utf8") !== "initialized\n")
      throw new Error("Backup refused: invalid initialization marker");
  }
  if (!lstatSync(join(source, "server.sqlite")).isFile() || !lstatSync(join(source, "minio")).isDirectory())
    throw new Error("Backup refused: incomplete data boundary");
  assertTree(source);
  assertStopped(source);
  let staging;
  let claimed = false;
  let completed = false;
  try {
    mkdirSync(destination, { mode: 0o700 });
    claimed = true;
    staging = mkdtempSync(join(dirname(destination), ".luna-backup-"));
    assertStopped(source);
    command("cp", ["-a", "--", `${source}/.`, staging]);
    assertStopped(source);
    const copiedStat = lstatSync(staging);
    if (copiedStat.uid !== rootStat.uid || copiedStat.gid !== rootStat.gid)
      throw new Error("Backup could not preserve numeric ownership");
    renameSync(staging, destination);
    staging = undefined;
    completed = true;
    console.log("LUNA_SERVER_BACKUP_OK");
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    // Only remove our empty reservation. An unexpected file is preserved.
    if (claimed && !completed && readdirSync(destination).length === 0) rmdirSync(destination);
  }
}

if (process.argv.length !== 4 || process.argv.includes("--help")) {
  console.log("Usage: node deploy/backup.mjs DATA NEW_BACKUP_DIRECTORY\nRequires same-host Docker CLI with a local Unix socket and GNU cp. Stop every data writer and keep the maintenance window closed until completion. Docker checks cannot prevent a concurrent restart or non-container writer.");
  process.exitCode = process.argv.includes("--help") ? 0 : 1;
} else {
  try { backup(process.argv[2], process.argv[3]); }
  catch (error) {
    console.error(error?.code === "EEXIST" ? "Backup destination already exists" : error?.code === "ENOENT" ? "Backup refused: required path is missing" : error instanceof Error ? error.message : "Backup failed");
    process.exitCode = 1;
  }
}
