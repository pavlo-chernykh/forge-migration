import * as crypto from "crypto";
import { getWebhookSecret } from "./storage";
import { transitionToDone } from "./jiraService";

const ISSUE_RE = /[A-Z][A-Z0-9_]+-\d+/g;
const extractIssueKey = (s: string) => (s.match(ISSUE_RE) || [])[0] || null;

function hmacHex(algo: "sha256" | "sha1", secret: string, raw: string) {
  const h = crypto.createHmac(algo, Buffer.from(secret, "utf8"));
  h.update(Buffer.from(raw, "utf8"));
  return h.digest("hex");
}

export const run = async (req: any) => {
  const raw =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? "");

  const h = req.headers || {};
  const sig256 = (h["x-hub-signature-256"] || h["X-Hub-Signature-256"] || "")
    .toString()
    .trim();
  const sigSha1 = (h["x-hub-signature"] || h["X-Hub-Signature"] || "")
    .toString()
    .trim();

  const secret = await getWebhookSecret();
  let match = false;
  let why = "no-sig";

  if (secret) {
    if (sig256) {
      const cmp = "sha256=" + hmacHex("sha256", String(secret), raw);
      if (cmp.length === sig256.length) {
        try {
          match = crypto.timingSafeEqual(Buffer.from(cmp), Buffer.from(sig256));
        } catch {
          match = false;
          why = "timingSafeEqual-err";
        }
      } else {
        why = `len-mismatch sha256 got:${sig256.length} cmp:${cmp.length}`;
      }
    } else if (sigSha1) {
      // legacy header some repos still send
      const cmp = "sha1=" + hmacHex("sha1", String(secret), raw);
      if (cmp.length === sigSha1.length) {
        try {
          match = crypto.timingSafeEqual(
            Buffer.from(cmp),
            Buffer.from(sigSha1)
          );
        } catch {
          match = false;
          why = "timingSafeEqual-err";
        }
      } else {
        why = `len-mismatch sha1 got:${sigSha1.length} cmp:${cmp.length}`;
      }
    }
  } else {
    why = "no-secret";
  }

  console.log("[WH] received", {
    has256: !!sig256,
    hasSha1: !!sigSha1,
    rawType: typeof req.body,
    rawLen: raw.length,
    secretLen: secret ? String(secret).length : 0,
    match,
    why,
  });

  if (!match) {
    return { statusCode: 401, body: "invalid signature" };
  }

  const event = JSON.parse(raw);
  console.log("[WH] event", event);

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
