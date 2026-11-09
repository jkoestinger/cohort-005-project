import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTIFICATION_WORKFLOW_CATEGORY } from "../app/lib/notification-kinds";
import {
  buildAllWorkflows,
  buildEnvironmentDefaults,
  buildLayout,
  LAYOUT_KEY,
} from "./knock-config";

// ─── npm run knock:setup ───
// Writes Cadence's Knock configuration to the Development environment through
// the Management API, then commits it: the shared email layout, the seven
// workflows, the `app_url` variable and the environment default preference
// set. Safe to re-run. Production gets the committed workflows and layout by
// promotion (#37), never by writing to it directly.
//
// Needs KNOCK_SERVICE_TOKEN in .env. Not handled here (the Management API can
// only read channels): connecting the email channel in each environment.

const ENVIRONMENT = "development";
const APP_URL = process.env.KNOCK_APP_URL ?? "http://localhost:5173";
const API = "https://control.knock.app/v1";

const token = process.env.KNOCK_SERVICE_TOKEN;
if (!token) {
  console.error("KNOCK_SERVICE_TOKEN is missing from .env.");
  process.exit(1);
}

async function put(pathAndQuery: string, body?: unknown) {
  const response = await fetch(`${API}${pathAndQuery}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PUT ${pathAndQuery} failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

const knockDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knock");
const env = `environment=${ENVIRONMENT}`;

// Workflows can only name a category that's in the catalog.
await put(`/preference_categories/${NOTIFICATION_WORKFLOW_CATEGORY}`);
console.log(`category ${NOTIFICATION_WORKFLOW_CATEGORY}`);

await put(`/email_layouts/${LAYOUT_KEY}?${env}`, { email_layout: buildLayout(knockDir) });
console.log(`email layout ${LAYOUT_KEY}`);

for (const { key, body } of buildAllWorkflows(knockDir)) {
  await put(`/workflows/${key}?${env}`, { workflow: body });
  console.log(`workflow ${key}`);
}

await put(`/variables/app_url`, {
  type: "public",
  description: "Cadence's origin; Notification emails link to {{ vars.app_url }}{{ data.url }}.",
  environment_values: { [ENVIRONMENT]: APP_URL },
});
console.log(`variable app_url = ${APP_URL} (${ENVIRONMENT})`);

await put(`/environments/${ENVIRONMENT}/defaults`, buildEnvironmentDefaults());
console.log("environment default preference set");

await put(
  `/commits?${env}&commit_message=${encodeURIComponent("knock:setup from the Cadence repo")}`,
);
console.log(`committed in ${ENVIRONMENT}`);
