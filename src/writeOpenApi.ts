import { writeFileSync } from "node:fs";
import { buildOpenApi } from "./openapi.js";

const document = buildOpenApi();
writeFileSync(new URL("../openapi.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
console.log("wrote openapi.json");
