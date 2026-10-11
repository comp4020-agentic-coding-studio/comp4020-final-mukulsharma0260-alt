import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Every open sky holds one long-lived SSE connection, and Fly's proxy counts
// those against the service's concurrency limits. A showcase room of ~60
// people with a couple of tabs each must not be queued or refused.
it("fly.toml lets enough long-lived connections stay open at once", () => {
  const toml = readFileSync("fly.toml", "utf8");
  const section = toml.match(/^\[http_service\.concurrency\]\n((?:(?!\[).*\n?)*)/m)?.[1];
  expect(section, "fly.toml has no [http_service.concurrency] section").toBeDefined();

  const value = (key: string) => section!.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1];
  expect(value("type")).toBe("connections");
  expect(Number(value("soft_limit"))).toBeGreaterThanOrEqual(200);
  expect(Number(value("hard_limit"))).toBeGreaterThanOrEqual(250);
});
