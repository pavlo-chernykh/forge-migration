import Resolver from "@forge/resolver";
import {
  clearPAT,
  clearWebhookSecret,
  getPAT,
  getWebhookSecret,
  savePAT,
  saveWebhookSecret,
} from "../backend/storage";
import {
  listRepos,
  listOpenPRs,
  prMatchesIssue,
  approvePR,
  mergePR,
  whoAmI,
  getRepo,
} from "../backend/githubService";
import { getIssue } from "../backend/jiraService";
import { requestJira, route, asUser } from "@forge/api";

const resolver = new Resolver();

resolver.define("getRepoBundle", async ({ payload }) => {
  const owner = payload?.owner;
  const repo = payload?.repo;
  const issueKey = (payload?.issueKey || "").trim() || undefined;

  if (!owner || !repo) throw new Error("owner, repo are required");

  // Only verify the issue if a key was provided
  if (issueKey) {
    await getIssue(issueKey); // asUser() validation
  }

  const [me, repoRaw, prsRaw] = await Promise.all([
    whoAmI(),
    getRepo(owner, repo),
    listOpenPRs(owner, repo),
  ]);

  const repoInfo = {
    full_name: repoRaw?.full_name || `${owner}/${repo}`,
    html_url: repoRaw?.html_url || "",
    language: repoRaw?.language || "",
    default_branch: repoRaw?.default_branch || "",
    visibility: repoRaw?.visibility || "",
    stargazers_count: repoRaw?.stargazers_count ?? 0,
    forks_count: repoRaw?.forks_count ?? 0,
    open_issues_count: repoRaw?.open_issues_count ?? 0,
    updated_at: repoRaw?.updated_at || "",
  };

  const prs = (Array.isArray(prsRaw) ? prsRaw : []).map((p) => ({
    number: p.number,
    title: p.title,
    html_url: p.html_url,
    head_ref: p?.head?.ref || "",
    author: p?.user?.login || "",
    state: p.state,
  }));

  const matchIndex = issueKey
    ? prs.findIndex((p) =>
        prMatchesIssue({ title: p.title, head: { ref: p.head_ref } }, issueKey)
      )
    : -1;

  return { me: me?.login || null, repo: repoInfo, prs, matchIndex };
});

resolver.define("getText", () => "Hello, world Resolver!");

resolver.define("saveToken", async ({ payload }) => {
  console.log("[BE] saveToken called");
  await savePAT(payload?.token);
  return { ok: true };
});

resolver.define("saveWebhookSecret", async ({ payload }) => {
  console.log("[BE] saveWebhookSecret called");
  await saveWebhookSecret(payload?.secret);
  return { ok: true };
});

resolver.define("getIssueInfo", async ({ payload }) => {
  const key = String(payload?.issueKey || "").trim();
  const j = await getIssue(key); // uses asUser()
  const f = j?.fields || {};
  console.log("[BE] getIssueInfo", {
    key: j?.key,
    summary: f.summary || "",
    status: f.status?.name || "",
    assignee: f.assignee?.displayName || "",
  });

  if (!j?.key) throw new Error(`Issue ${key} not found`);
  return {
    key: j?.key,
    summary: f.summary || "",
    status: f.status?.name || "",
    assignee: f.assignee?.displayName || "",
  };
});

resolver.define("listRepos", async () => {
  console.log("[BE] listRepos start");
  const raw = await listRepos(); // GitHub API
  const safe = (Array.isArray(raw) ? raw : [])
    .map((x) => ({
      id: x?.id ?? `${x?.owner?.login || ""}-${x?.name || ""}`,
      owner: x?.owner?.login ?? "",
      name: x?.name ?? "",
      full_name:
        x?.full_name ??
        (x?.owner?.login && x?.name ? `${x.owner.login}/${x.name}` : ""),
      html_url: x?.html_url ?? "",
      language: x?.language ?? "", // ← add
      default_branch: x?.default_branch ?? "", // ← add
      visibility: x?.visibility ?? "", // ← add
    }))
    .filter((r) => r.full_name);
  console.log("[BE] listRepos done", safe.length);
  return safe;
});

resolver.define("getRepoAndPR", async ({ payload }) => {
  const { owner, repo, issueKey } = payload || {};
  console.log("[BE] getRepoAndPR", { owner, repo, issueKey });

  if (!owner || !repo || !issueKey)
    throw new Error("owner, repo, issueKey are required");

  // ensure issue exists (for clearer errors)
  await getIssue(issueKey);

  const prs = await listOpenPRs(owner, repo);
  console.log("[BE] open PRs count", Array.isArray(prs) ? prs.length : "n/a");

  const pr = Array.isArray(prs)
    ? prs.find((p) => prMatchesIssue(p, issueKey))
    : null;
  console.log("[BE] matched PR?", !!pr);
  return { pr: pr || null };
});

resolver.define("approvePR", async ({ payload }) => {
  const { owner, repo, number } = payload || {};
  if (!owner || !repo || !number)
    throw new Error("owner, repo, number are required");
  await approvePR(owner, repo, number);
  return { ok: true };
});

resolver.define("mergePR", async ({ payload }) => {
  const { owner, repo, number } = payload || {};
  if (!owner || !repo || !number)
    throw new Error("owner, repo, number are required");
  await mergePR(owner, repo, number);
  return { ok: true };
});

resolver.define("getAuthState", async () => {
  const [token, secret] = await Promise.all([getPAT(), getWebhookSecret()]);
  console.log("[BE] getAuthState", { hasToken: !!token, hasSecret: !!secret });
  return { hasToken: !!token, hasSecret: !!secret };
});

resolver.define("listRecentIssues", async ({ payload }) => {
  const { projectKey } = payload || {};
  const jql = `project = ${projectKey} ORDER BY created DESC`;

  const body = { jql, maxResults: 10, fields: ["summary"] };

  let res = await asUser().requestJira(route`/rest/api/3/search/jql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 404 || res.status === 405 || res.status === 410) {
    res = await asUser().requestJira(route`/rest/api/3/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    throw new Error(`Jira ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // Normalize possible shapes safely:
  // - Classic: { issues: [{ key, fields: { summary } }, ...] }
  // - Some previews: { results: [{ key, fields: { summary } }] } OR { results: [{ issue: { key, fields } }] }
  const rawIssues = Array.isArray(data.issues)
    ? data.issues
    : Array.isArray(data.results)
    ? data.results.map((r) => (r.issue ? r.issue : r))
    : [];

  // Map defensively; never assume fields exists
  // console.log(
  //   "RETURN:",
  //   rawIssues
  //     .map((i) => ({
  //       key: i?.key,
  //       summary: i?.fields?.summary ?? "",
  //     }))
  //     .filter((x) => Boolean(x.key))
  // );
  return rawIssues
    .map((i) => ({
      key: i?.key,
      summary: i?.fields?.summary ?? "",
    }))
    .filter((x) => Boolean(x.key));
});

async function pickIssueTypeForProject(projectKey) {
  const res = await asUser().requestJira(
    route`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`
  );
  if (!res.ok)
    throw new Error(`Jira createmeta ${res.status}: ${await res.text()}`);

  const meta = await res.json();
  const types = meta?.projects?.[0]?.issuetypes || [];

  // Prefer "Task" (team-managed sometimes calls it "Task"), else first
  const chosen = types.find((t) => /task/i.test(t.name)) || types[0];
  if (!chosen)
    throw new Error(`No creatable issue types for project ${projectKey}`);
  return { id: chosen.id, name: chosen.name };
}

resolver.define("createTestIssue", async ({ payload }) => {
  const { projectKey, summary } = payload || {};
  console.log("[BE] createTestIssue", { projectKey, summary });

  const issueType = await pickIssueTypeForProject(projectKey);

  const res = await asUser().requestJira(route`/rest/api/3/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary,
        issuetype: { id: issueType.id },
      },
    }),
  });

  if (!res.ok) throw new Error(`Jira ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { key: j.key };
});

resolver.define("resetAuth", async () => {
  await Promise.all([clearPAT(), clearWebhookSecret()]);
  return { ok: true };
});

export const handler = resolver.getDefinitions();
