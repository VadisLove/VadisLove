/** Native PostgreSQL-Prüfungen in zwei frischen, nur lokal erreichbaren Clustern.
 * Die separat installierten Testwerkzeuge werden über absolute Modulpfade übergeben. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

assert.equal(
  process.versions.node.split(".")[0],
  "24",
  "Release verification requires Node 24",
);
assert.ok(
  process.env.RELEASE_NATIVE_POSTGRES_MODULE,
  "Set RELEASE_NATIVE_POSTGRES_MODULE",
);
assert.ok(process.env.CARPOOL_NATIVE_PG_MODULE, "Set CARPOOL_NATIVE_PG_MODULE");
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(process.env.RELEASE_NATIVE_POSTGRES_MODULE)
);
const app = fileURLToPath(new URL("../", import.meta.url));
const schema = fileURLToPath(
  new URL("../tests/fixtures/release-production-base.sql", import.meta.url),
);

async function runSuite(files, extraEnv) {
  // Geerbte Test-DB-Adressen dürfen nicht auf fremde lokale Datenbanken zeigen.
  const env = { ...process.env };
  for (const key of [
    "RELEASE_TEST_DATABASE_URL",
    "RELEASE_TEST_SCHEMA_PATH",
    "GUARDIAN_TEST_DATABASE_URL",
    "CARPOOL_TEST_DATABASE_URL",
  ])
    delete env[key];
  const child = spawn(process.execPath, ["--test", ...files], {
    cwd: app,
    stdio: "inherit",
    env: { ...env, ...extraEnv },
  });
  assert.equal(
    (await once(child, "exit"))[0],
    0,
    `Native suite failed: ${files.join(", ")}`,
  );
}
async function withCluster(port, verify) {
  const directory = await mkdtemp(`${tmpdir()}/trainer-release-native-`);
  const postgres = new EmbeddedPostgres({
    databaseDir: `${directory}/data`,
    user: "postgres",
    password: "isolated-fixture",
    port,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (message) => {
      if (String(message).includes("FATAL")) console.error(message);
    },
  });
  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase("release_test");
    await verify(
      `postgres://postgres:isolated-fixture@127.0.0.1:${port}/release_test`,
    );
    console.log(`Native isolated cluster passed: ${directory}`);
  } finally {
    // Testdaten bleiben zur Diagnose erhalten; der Datenbankprozess endet immer.
    await postgres.stop();
  }
}

await withCluster(55439, (url) =>
  runSuite(["tests/carpool-database.test.mjs"], {
    CARPOOL_TEST_DATABASE_URL: url,
  }),
);
await withCluster(55440, async (url) => {
  await runSuite(["tests/release-migrations.test.mjs"], {
    RELEASE_TEST_DATABASE_URL: url,
    RELEASE_TEST_SCHEMA_PATH: schema,
  });
  await runSuite(["tests/guardian-database.test.mjs"], {
    GUARDIAN_TEST_DATABASE_URL: url,
  });
});
