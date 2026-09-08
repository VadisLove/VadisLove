/** Produktionsbuild mit erkennbaren Testwerten: keine echten Keys und keine
 * externen Mails. HTTP-Proben und Client-Artefakte werden danach kontrolliert. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../", import.meta.url));
const baseUrl = "http://127.0.0.1:3108";
const secretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CARPOOL_CRON_SECRET",
];
const markers = Object.fromEntries(
  secretNames.map((name) => [
    name,
    `release-preflight-only-${name.toLowerCase()}`,
  ]),
);
const env = {
  ...process.env,
  ...markers,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54339",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-only",
  NEXT_PUBLIC_APP_URL: "https://trainer-webapp-ruby.vercel.app",
  RESEND_FROM_EMAIL: "Trainer Hub <fixture@example.invalid>",
};
const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

function assertNoSecrets(text, context) {
  for (const value of [...secretNames, ...Object.values(markers)]) {
    assert.ok(!text.includes(value), `${context}: server-only marker exposed`);
  }
}
async function inspectFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) count += await inspectFiles(path);
    else {
      assertNoSecrets(await readFile(path, "utf8"), path);
      count++;
    }
  }
  return count;
}
async function startAndCheck(secret) {
  // Loopback und feste Ports verhindern eine versehentliche Veröffentlichung.
  const server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3108"],
    {
      cwd: app,
      env: { ...env, CARPOOL_CRON_SECRET: secret },
      stdio: "inherit",
    },
  );
  const exited = once(server, "exit");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(server.exitCode, null, "Release server exited early");
      try {
        if ((await fetch(`${baseUrl}/login`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Der Server benötigt vor dem ersten HTTP-Aufruf einen Moment. */
      }
      await delay(100);
    }
    assert.ok(ready, "Release server did not become ready");
    for (const authorization of [
      null,
      "Bearer wrong",
      `Bearer ${markers.CARPOOL_CRON_SECRET.slice(0, -1)}x`,
      "Basic invalid",
    ]) {
      const response = await fetch(`${baseUrl}/api/carpools/mail`, {
        headers: authorization ? { authorization } : {},
        redirect: "manual",
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("location"), null);
      assert.deepEqual(await response.json(), { error: "Unauthorized" });
    }
    // Ein Login-Cookie ersetzt das Cron-Geheimnis ausdrücklich nicht.
    const cookieResponse = await fetch(`${baseUrl}/api/carpools/mail`, {
      headers: { cookie: "sb-fixture-auth-token=invalid" },
      redirect: "manual",
    });
    assert.equal(cookieResponse.status, 401);
    const authenticatedWorker = await fetch(`${baseUrl}/api/carpools/mail`, {
      headers: { authorization: `Bearer ${markers.CARPOOL_CRON_SECRET}` },
      redirect: "manual",
    });
    // Der richtige Nachweis erreicht den Worker. Ohne echte Versanddienste muss
    // dieser kontrolliert 503 liefern; der Test führt keinen externen Versand aus.
    assert.equal(authenticatedWorker.status, secret ? 503 : 401);
    assert.deepEqual(await authenticatedWorker.json(), {
      error: secret ? "Carpool mail worker unavailable" : "Unauthorized",
    });
    for (const path of [
      "/",
      "/kalender",
      "/fahrgemeinschaften",
      "/einstellungen",
      "/api/carpools",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      assert.equal(response.status, 307, path);
      assert.equal(
        new URL(response.headers.get("location"), baseUrl).pathname,
        "/login",
        path,
      );
      assertNoSecrets(await response.text(), path);
    }
    const login = await fetch(`${baseUrl}/login`);
    assert.equal(login.status, 200);
    assertNoSecrets(await login.text(), "/login");
    console.log(
      `HTTP checks passed (${secret ? "configured" : "missing"} cron secret)`,
    );
  } finally {
    server.kill("SIGTERM");
    await exited;
  }
}

assert.equal(
  process.versions.node.split(".")[0],
  "24",
  "Release verification requires Node 24",
);
const build = spawn(process.execPath, [nextBin, "build"], {
  cwd: app,
  env,
  stdio: "inherit",
});
assert.equal((await once(build, "exit"))[0], 0, "Production build failed");
console.log(
  `No server secrets in ${await inspectFiles(`${app}/.next/static`)} browser artifacts`,
);
await startAndCheck("");
await startAndCheck(markers.CARPOOL_CRON_SECRET);
