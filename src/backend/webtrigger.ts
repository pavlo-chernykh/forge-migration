import * as crypto from "crypto";
import { getWebhookSecret } from "./storage";
import { transitionToDone } from "./jiraService";

const ISSUE_RE = /[A-Z][A-Z0-9_]+-\d+/g;

function extractIssueKey(s: string) {
  const m = (s || "").match(ISSUE_RE);
  return m ? m[0] : null;
}

function verifySignature(
  raw: string,
  signature: string | undefined,
  secret: string
) {
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

export const run = async (req: any) => {
  const raw = await req.text(); // use raw body for HMAC
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  console.log("[WH] received", { sig: !!sig });
  const secret = await getWebhookSecret();
  if (!secret || !verifySignature(raw, sig, String(secret))) {
    return { statusCode: 401, body: "invalid signature" };
  }

  const event = JSON.parse(raw);
  if (event?.action === "closed" && event?.pull_request?.merged) {
    const title = event.pull_request.title || "";
    const ref = event.pull_request.head?.ref || "";
    console.log("[WH] merged PR detected", { title, ref });
    const key = extractIssueKey(`${title} ${ref}`);
    if (key) {
      console.log("[WH] transition issue", key);
      try {
        await transitionToDone(key);
      } catch (e: any) {
        return {
          statusCode: 500,
          body: `transition error: ${e?.message || e}`,
        };
      }
    }
    console.log("[WH] no issue key found in PR");
  }
  console.log("[WH] event ignored", {
    action: event?.action,
    merged: event?.pull_request?.merged,
  });
  return { statusCode: 200, body: "ok" };
};
