// src/frontend/index.jsx
import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Text,
  Textfield,
  Button,
  SectionMessage,
  Inline,
  Stack,
  Link,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const ISSUE_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

const statusChip = (s) => {
  const t = String(s || "").toLowerCase();
  if (/done|closed|resolved/.test(t)) return "✅ Done";
  if (/progress|in\s*progress/.test(t)) return "🟡 In Progress";
  if (/todo|to\s*do|backlog/.test(t)) return "⭕️ To Do";
  return s || "—";
};

function App() {
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [activeView, setActiveView] = useState("issue");
  const [projectKey, setProjectKey] = useState("");
  const [issues, setIssues] = useState([]);
  const [issueKey, setIssueKey] = useState("");
  const [issueInfo, setIssueInfo] = useState(null);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [repoInfo, setRepoInfo] = useState(null);
  const [prs, setPrs] = useState([]);
  const [me, setMe] = useState(null);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke("getAuthState");
        setSaved(Boolean(s?.hasToken && s?.hasSecret));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const k = String(issueKey || "").trim();
      setIssueInfo(null);
      if (!k) return;
      try {
        const info = await invoke("getIssueInfo", { issueKey: k });
        setIssueInfo(info || null);
      } catch {}
    })();
  }, [issueKey]);

  const saveCreds = async () => {
    try {
      if (!token) return setMsg("GitHub PAT is required.");
      if (!secret) return setMsg("Webhook secret is required.");
      setMsg("Saving…");
      await invoke("saveToken", { token });
      await invoke("saveWebhookSecret", { secret });
      setSaved(true);
      setMsg("Saved.");
    } catch (e) {
      setMsg(`Save error: ${e?.message || e}`);
    }
  };

  const reset = async () => {
    try {
      await invoke("resetAuth");
      setSaved(false);
      setToken("");
      setSecret("");
      setProjectKey("");
      setIssues([]);
      setIssueKey("");
      setIssueInfo(null);
      setRepos([]);
      setSelectedRepo(null);
      setRepoInfo(null);
      setPrs([]);
      setMe(null);
      setMatchIndex(-1);
      setActiveView("issue");
      setMsg("Credentials cleared.");
    } catch (e) {
      setMsg(`Reset error: ${e?.message || e}`);
    }
  };

  const listRecentIssues = async () => {
    const pk = String(projectKey || "").trim();
    if (!pk) return setMsg("Enter a Project key, e.g., SAMPLEPROJ");
    setMsg("Loading recent issues…");
    try {
      const list = await invoke("listRecentIssues", { projectKey: pk });
      const safe = Array.isArray(list) ? list.filter((x) => x && x.key) : [];
      setIssues(safe);
      setMsg(safe.length ? "" : "No recent issues found for this project.");
    } catch (e) {
      setMsg(`Search error: ${e?.message || e}`);
      setIssues([]);
    }
  };

  const createTestIssue = async () => {
    const pk = String(projectKey || "").trim();
    if (!pk) return setMsg("Enter a Project key, e.g., SAMPLEPROJ");
    setMsg("Creating test issue…");
    try {
      const { key } = await invoke("createTestIssue", {
        projectKey: pk,
        summary: "Forge demo issue",
      });
      setIssueKey(key);
      setActiveView("connected");
      setMsg(
        `Created ${key}. Now load repos and pick one with "${key}" in a PR title/branch.`
      );
    } catch (e) {
      setMsg(`Create error: ${e?.message || e}`);
    }
  };

  const chooseIssue = (key) => {
    setIssueKey(key);
    setActiveView("connected");
    setMsg(`Selected ${key}. Now load repos and pick a repository.`);
  };

  const loadRepos = async () => {
    setMsg("Loading repos…");
    try {
      const k = String(issueKey || "").trim();
      const payload = ISSUE_RE.test(k) ? { issueKey: k } : {};
      const r = await invoke("listRepos", payload);
      setRepos(Array.isArray(r) ? r : []);
      setMsg(
        r?.length
          ? ""
          : ISSUE_RE.test(k)
          ? "No repositories have an open PR matching that Issue Key."
          : "No repos visible to this token."
      );
    } catch (e) {
      setMsg(`Error: ${e?.message || e}`);
      setRepos([]);
    }
  };

  const pickRepo = async (fullName) => {
    setSelectedRepo(fullName);
    setRepoInfo(null);
    setPrs([]);
    setMatchIndex(-1);
    setLoadingRepo(true);

    if (!fullName || !fullName.includes("/")) {
      setMsg("Bad repo identifier");
      setLoadingRepo(false);
      return;
    }
    const [owner, repo] = fullName.split("/");

    const k = String(issueKey || "").trim();
    const effectiveKey = ISSUE_RE.test(k) ? k : undefined;

    try {
      const bundle = await invoke("getRepoBundle", {
        owner,
        repo,
        issueKey: effectiveKey,
      });
      setMe(bundle?.me || null);
      setRepoInfo(bundle?.repo || null);
      setPrs(Array.isArray(bundle?.prs) ? bundle.prs : []);
      setMatchIndex(
        typeof bundle?.matchIndex === "number" ? bundle.matchIndex : -1
      );

      if (!effectiveKey) {
        setMsg(
          bundle?.prs?.length
            ? "Tip: enter an Issue Key to highlight a matching PR."
            : "Have no opened pull requests."
        );
      } else {
        setMsg(bundle?.prs?.length ? "" : "Have no opened pull requests.");
      }
    } catch (e) {
      setMsg(`Load error: ${e?.message || e}`);
    } finally {
      setLoadingRepo(false);
    }
  };

  const approveNumber = async (number) => {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split("/");
    setMsg("Approving…");
    try {
      await invoke("approvePR", { owner, repo, number });
      setMsg("Approved.");
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };

  const mergeNumber = async (number) => {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split("/");
    setMsg("Merging…");
    try {
      await invoke("mergePR", { owner, repo, number });
      setMsg("Merged. Jira will transition via webhook if the PR was merged.");
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };

  const AuthBlock = !saved && (
    <SectionMessage title="Auth" appearance="information">
      <Stack space="small">
        <Text>
          Save your GitHub Personal Access Token and GitHub Webhook Secret.
        </Text>
        <Textfield
          name="gh-pat"
          placeholder="GitHub PAT"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Textfield
          name="gh-secret"
          placeholder="GitHub Webhook Secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <Inline space="small">
          <Button appearance="primary" onClick={saveCreds}>
            Save
          </Button>
        </Inline>
      </Stack>
    </SectionMessage>
  );

  const NavBar = saved && (
    <Inline space="small">
      <Button
        appearance={activeView === "issue" ? "primary" : "default"}
        onClick={() => setActiveView("issue")}
      >
        Issue
      </Button>
      <Button
        appearance={activeView === "connected" ? "primary" : "default"}
        onClick={() => setActiveView("connected")}
      >
        Connected
      </Button>
    </Inline>
  );

  const IssueScreen = saved && activeView === "issue" && (
    <SectionMessage
      title="Pick or create a Jira issue"
      appearance="information"
    >
      <Stack space="small">
        <Text>
          Enter your Project key (e.g., SAMPLEPROJ), then create a test issue or
          list recent ones and click to select.
        </Text>
        <Textfield
          name="project-key"
          placeholder="Project key (e.g., SAMPLEPROJ)"
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
        />
        <Inline space="small">
          <Button onClick={listRecentIssues}>List recent issues</Button>
          <Button appearance="primary" onClick={createTestIssue}>
            Create test issue
          </Button>
        </Inline>

        {issues?.length > 0 && (
          <Stack space="none">
            {issues.map((it) => (
              <Text key={it.key} onClick={() => chooseIssue(it.key)}>
                {it.key} — {it.summary || "(no summary)"} ·{" "}
                {statusChip(it.status)}
              </Text>
            ))}
          </Stack>
        )}

        {issueKey && (
          <SectionMessage title="Selected issue" appearance="confirmation">
            <Stack space="none">
              <Text>{issueKey}</Text>
              {issueInfo && (
                <Text>
                  {issueInfo.summary || ""} [{issueInfo.status || "Status"}]
                  {issueInfo.assignee
                    ? ` · Assignee: ${issueInfo.assignee}`
                    : ""}
                </Text>
              )}
            </Stack>
          </SectionMessage>
        )}
      </Stack>
    </SectionMessage>
  );

  const ConnectedScreen = saved && activeView === "connected" && (
    <SectionMessage title="Connected" appearance="confirmation">
      <Stack space="small">
        <Textfield
          name="issue"
          placeholder="Issue Key to match (optional, e.g., SAMPLEPROJ-9)"
          value={issueKey}
          onChange={(e) => setIssueKey(e.target.value)}
        />
        <Inline space="small">
          <Button onClick={loadRepos}>Load my repos</Button>
        </Inline>

        {Array.isArray(repos) && repos.length > 0 && (
          <Stack space="large">
            {repos.map((r) => {
              const isSelected = selectedRepo === r.full_name;
              return (
                <SectionMessage
                  key={r.id}
                  title={r.full_name}
                  appearance={isSelected ? "confirmation" : "information"}
                >
                  <Stack space="small">
                    <Text>
                      {r.language || "n/a"} ({r.visibility || "public"}) ·
                      default: {r.default_branch || "n/a"}
                    </Text>

                    <Inline space="small">
                      {r.firstMatch?.number && (
                        <Text>
                          Matched PR #{r.firstMatch.number}{" "}
                          {r.firstMatch.html_url && (
                            <Link href={r.firstMatch.html_url} openNewTab>
                              (open)
                            </Link>
                          )}
                        </Text>
                      )}
                      <Button onClick={() => pickRepo(r.full_name)}>
                        {isSelected ? "Refresh" : "Select"}
                      </Button>
                    </Inline>

                    {isSelected && (
                      <Stack space="medium">
                        <Text> </Text>

                        {loadingRepo && <Text>Loading repository & PRs…</Text>}

                        {repoInfo && (
                          <Stack space="xsmall">
                            <Text>
                              <Link href={repoInfo.html_url} openNewTab>
                                {repoInfo.full_name}
                              </Link>
                            </Text>
                            <Text>
                              Language: {repoInfo.language || "n/a"} · Default
                              branch: {repoInfo.default_branch || "n/a"} ·
                              Visibility: {repoInfo.visibility || "public"}
                            </Text>
                            <Text>
                              Stars: {repoInfo.stargazers_count} · Forks:{" "}
                              {repoInfo.forks_count} · Open issues:{" "}
                              {repoInfo.open_issues_count}
                            </Text>
                            <Text>Updated: {repoInfo.updated_at || "n/a"}</Text>
                          </Stack>
                        )}

                        {Array.isArray(prs) &&
                          prs.length === 0 &&
                          !loadingRepo && (
                            <Text>Have no opened pull requests.</Text>
                          )}

                        {Array.isArray(prs) && prs.length > 0 && (
                          <Stack space="medium">
                            {prs.map((p, idx) => {
                              const isMatch = idx === matchIndex;
                              const isOwn =
                                me &&
                                p?.author &&
                                me.toLowerCase() === p.author.toLowerCase();
                              return (
                                <SectionMessage
                                  key={p.number}
                                  title={
                                    isMatch
                                      ? `PR #${p.number} (matches ${
                                          issueKey || "no key"
                                        })`
                                      : `PR #${p.number}`
                                  }
                                  appearance={
                                    isMatch ? "confirmation" : "information"
                                  }
                                >
                                  <Stack space="small">
                                    <Text>
                                      <Link href={p.html_url} openNewTab>
                                        {p.title || p.html_url}
                                      </Link>
                                    </Text>
                                    <Text>
                                      Branch: {p.head_ref || "(unknown)"} ·
                                      Author: {p.author || "(unknown)"}
                                    </Text>
                                    <Inline space="small">
                                      {isOwn ? (
                                        <Button
                                          isDisabled
                                          tooltip="You can't approve your own PR"
                                        >
                                          Approve
                                        </Button>
                                      ) : (
                                        <Button
                                          onClick={() =>
                                            approveNumber(p.number)
                                          }
                                        >
                                          Approve
                                        </Button>
                                      )}
                                      <Button
                                        appearance="primary"
                                        onClick={() => mergeNumber(p.number)}
                                      >
                                        Merge
                                      </Button>
                                    </Inline>
                                  </Stack>
                                </SectionMessage>
                              );
                            })}
                          </Stack>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </SectionMessage>
              );
            })}
          </Stack>
        )}
      </Stack>
    </SectionMessage>
  );

  return (
    <Stack space="large">
      <Text size="xlarge">GitHub ↔ Jira (Forge Admin Page)</Text>
      {!!msg && <Text>{msg}</Text>}

      {AuthBlock}
      {NavBar}
      {IssueScreen}
      {ConnectedScreen}

      {saved && (
        <Inline space="small">
          <Button
            appearance="subtle"
            onClick={() => {
              setActiveView("issue");
              setRepos([]);
              setSelectedRepo(null);
              setRepoInfo(null);
              setPrs([]);
              setMatchIndex(-1);
              setMsg("");
            }}
          >
            Back to Issue
          </Button>
          <Button appearance="warning" onClick={reset}>
            Reset credentials (clear storage)
          </Button>
        </Inline>
      )}
    </Stack>
  );
}

ForgeReconciler.render(<App />);
