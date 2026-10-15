import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const target = fileURLToPath(new URL("../apps/web/public/vendor/web-ifc/", import.meta.url));
await mkdir(target, { recursive: true });
await copyFile(join(dirname(require.resolve("web-ifc")), "web-ifc.wasm"), join(target, "web-ifc.wasm"));
