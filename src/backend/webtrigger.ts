import * as crypto from "crypto";
import { getWebhookSecret } from "./storage";
import { transitionToDone } from "./jiraService";

const ISSUE_RE = /[A-Z][A-Z0-9_]+-\d+/g;

function extractIssueKey(s: string) {
  const m = (s || "").match(ISSUE_RE);
  return m ? m[0] : null;
}

function computeSig256(secret: string, raw: string) {
  const h = crypto.createHmac("sha256", Buffer.from(secret, "utf8"));
  h.update(Buffer.from(raw, "utf8"));
  return "sha256=" + h.digest("hex");
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
  // Forge webtrigger gives you headers + body directly
  const raw =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? "");
  const gotSig =
    (req.headers?.["x-hub-signature-256"] as string | undefined) ||
    (req.headers?.["X-Hub-Signature-256"] as string | undefined) ||
    "";

  const secret = await getWebhookSecret();

  // Debug (safe): show lengths + first 12 chars only
  const cmp = secret ? computeSig256(String(secret), raw) : "";
  const match =
    !!secret &&
    !!gotSig &&
    crypto.timingSafeEqual(Buffer.from(cmp), Buffer.from(gotSig));

  console.log("[WH] received", {
    hasSig: !!gotSig,
    rawType: typeof req.body,
    rawLen: raw.length,
    secLen: secret ? String(secret).length : 0,
    sigPrefix: gotSig.slice(0, 12),
    cmpPrefix: cmp.slice(0, 12),
    match,
  });

  if (!match) {
    return { statusCode: 401, body: "invalid signature" };
  }

  const event = JSON.parse(raw);
  console.log("event: ", event);

  if (event?.action === "closed" && event?.pull_request?.merged) {
    const title = event.pull_request.title || "";
    const ref = event.pull_request.head?.ref || "";
    const key = extractIssueKey(`${title} ${ref}`);
    console.log("[WH] merged PR", { title, ref, key });
    if (key) {
      try {
        await transitionToDone(key);
      } catch (e: any) {
        return {
          statusCode: 500,
          body: `transition error: ${e?.message || e}`,
        };
      }
    } else {
      console.log("[WH] no issue key found in title/branch");
    }
  } else {
    console.log("[WH] event ignored", {
      action: event?.action,
      merged: event?.pull_request?.merged,
    });
  }
  return { statusCode: 200, body: "ok" };
};
