import { fetch } from "@forge/api";
import { getPAT } from "./storage";

const BASE = "https://api.github.com";
const ISSUE_RE = /[A-Z][A-Z0-9_]+-\d+/g;

const authHeaders = async () => ({
  Authorization: `Bearer ${await getPAT()}`,
  Accept: "application/vnd.github+json",
});

async function gh(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

export const getRepo = (owner, repo) => gh(`/repos/${owner}/${repo}`);
export const whoAmI = () => gh(`/user`);

export const listRepos = () => gh("/user/repos?per_page=50");

export const listOpenPRs = (owner, repo) =>
  gh(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`);

export const approvePR = (owner, repo, number) =>
  gh(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method: "POST",
    body: JSON.stringify({ event: "APPROVE" }),
  });

export const mergePR = (owner, repo, number) =>
  gh(`/repos/${owner}/${repo}/pulls/${number}/merge`, { method: "PUT" });

export function prMatchesIssue(pr, issueKey) {
  const hay = `${pr?.title || ""} ${pr?.head?.ref || ""}`;
  const found = (hay.match(ISSUE_RE) || []).map((s) => s.toUpperCase());
  return found.includes(String(issueKey || "").toUpperCase());
}
