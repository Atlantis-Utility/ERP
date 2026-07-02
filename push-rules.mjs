import { createRequire } from "module";
import { readFileSync } from "fs";
const require = createRequire(import.meta.url);

const ft = "C:/Users/yashv/AppData/Roaming/npm/node_modules/firebase-tools";

// Load the same configstore that firebase-tools uses internally
const { configstore } = require(ft + "/lib/configstore");
const user   = configstore.get("user");
const tokens = configstore.get("tokens");

if (!user || !tokens?.refresh_token) {
  console.error("Not authenticated. Run: firebase login");
  process.exit(1);
}
console.log("Authenticated as:", user.email);

// Set auth context the same way the CLI does
const auth = require(ft + "/lib/auth");
auth.setActiveAccount({ project: "atlantis-utility" }, { user, tokens });

const rules = require(ft + "/lib/gcp/rules");

const PROJECT      = "atlantis-utility";
const RELEASE_NAME = "cloud.firestore/atlantisutility";
const SRC          = readFileSync("./firestore.rules", "utf8");

// API expects an array of { name, content } file objects
const files = [{ name: "firestore.rules", content: SRC }];

console.log("Creating ruleset...");
const rulesetName = await rules.createRuleset(PROJECT, files);
console.log("Ruleset:", rulesetName);

console.log("Updating release for database: atlantisutility");
const rel = await rules.updateOrCreateRelease(PROJECT, rulesetName, RELEASE_NAME);
console.log("Done. Release:", rel.name);
console.log("\nRules are now live on the atlantisutility database.");
