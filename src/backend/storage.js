import { storage } from "@forge/api";

const GH_PAT_KEY = "gh_pat";
const GH_WEBHOOK_SECRET_KEY = "gh_webhook_secret";

export const savePAT = async (token) => {
  const v = String(token || "").trim();
  if (!v) throw new Error("Token is required");
  await storage.set(GH_PAT_KEY, v);
  return true;
};

export const getPAT = () => storage.get(GH_PAT_KEY);

export const clearPAT = () => storage.delete("gh_pat");

export const clearWebhookSecret = () => storage.delete("gh_webhook_secret");

export const saveWebhookSecret = async (secret) => {
  const v = String(secret || "").trim();
  if (!v) throw new Error("Webhook secret is required");
  await storage.set(GH_WEBHOOK_SECRET_KEY, v);
  return true;
};

export const getWebhookSecret = () => storage.get(GH_WEBHOOK_SECRET_KEY);
