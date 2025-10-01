import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Text,
  Textfield,
  Button,
  SectionMessage,
  Inline,
  Stack,
  Table,
  Head,
  Row,
  Cell,
  Link,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const ISSUE_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

const App = () => {
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");

  const [issueKey, setIssueKey] = useState("");
  const [repos, setRepos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pr, setPr] = useState(null);
  const [msg, setMsg] = useState("");

  const [projectKey, setProjectKey] = useState("");
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const s = await invoke("getAuthState");
        console.log("[UI] getAuthState", s);
        setSaved(Boolean(s?.hasToken));
      } catch (e) {
        console.warn("[UI] getAuthState error", e);
      }
    })();
  }, []);

  const save = async () => {
    try {
      console.log("[UI] save token/secret");
      await invoke("saveToken", { token });
      if (!secret) {
        setMsg("Webhook secret is required (from your GitHub webhook).");
        return;
      }
      await invoke("saveWebhookSecret", { secret });
      setSaved(true);
      setMsg("");
    } catch (e) {
      console.error("[UI] save error", e);
      setMsg(`Save error: ${e?.message || e}`);
    }
  };

  const loadRepos = async () => {
    setMsg("Loading repos…");
    try {
      console.log("[UI] listRepos");
      const r = await invoke("listRepos");
      setRepos(r);
      setMsg("");
    } catch (e) {
      console.error("[UI] listRepos error", e);
      setMsg(`Error: ${e?.message || e}`);
    }
  };

  const pickRepo = async (fullName) => {
    try {
      console.log("[UI] pickRepo", { fullName, issueKey });
      setSelected(fullName);
      setPr(null);

      const ISSUE_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
      if (!ISSUE_RE.test(String(issueKey).trim())) {
        setMsg("Invalid Issue Key. Example: SAMPLEPROJ-9");
        return;
      }

      if (!fullName || !fullName.includes("/")) {
        setMsg("Bad repo identifier");
        return;
      }

      const [owner, repo] = fullName.split("/");
      setMsg("Loading PR…");
      const cleanedKey = String(issueKey).trim();
      const { pr } = await invoke("getRepoAndPR", {
        owner,
        repo,
        issueKey: cleanedKey,
      });
      console.log("[UI] getRepoAndPR result", pr);
      setPr(pr || null);
      console.log("PR SAVED, pr: ", pr);
      setMsg(pr ? "" : "Have no opened pull requests.");
    } catch (e) {
      console.error("[UI] pickRepo error", e);
      setMsg(`Error: ${e?.message || e}`);
    }
  };

  const approve = async () => {
    if (!pr) return;
    const [owner, repo] = selected.split("/");
    console.log("[UI] approvePR", { owner, repo, number: pr.number });
    setMsg("Approving…");
    try {
      await invoke("approvePR", { owner, repo, number: pr.number });
      setMsg("Approved.");
    } catch (e) {
      setMsg(String(e.message || e));
    }
  };

  const merge = async () => {
    if (!pr) return;
    const [owner, repo] = selected.split("/");
    console.log("[UI] mergePR", { owner, repo, number: pr.number });
    setMsg("Merging…");
    try {
      await invoke("mergePR", { owner, repo, number: pr.number });
      setMsg("Merged. Jira will transition via webhook if the PR was merged.");
    } catch (e) {
      setMsg(String(e.message || e));
    }
  };

  const createTestIssue = async () => {
    console.log("[UI] createTestIssue", { projectKey });
    if (!projectKey.trim()) {
      setMsg("Enter a Project key, e.g., KAN");
      return;
    }
    setMsg("Creating test issue…");
    try {
      const { key } = await invoke("createTestIssue", {
        projectKey,
        summary: "Forge demo issue",
      });
      console.log("[UI] created issue", key);
      setIssueKey(key);
      setMsg(
        `Created ${key}. You can now load repos and find a PR with "${key}" in title/branch.`
      );
    } catch (e) {
      console.error("[UI] createTestIssue error", e);
      setMsg(`Create error: ${e?.message || e}`);
    }
  };

  const loadRecentIssues = async () => {
    console.log("[UI] listRecentIssues", { projectKey });
    if (!projectKey.trim()) {
      setMsg("Enter a Project key, e.g., SAMPLEPROJ");
      return;
    }
    setMsg("Loading recent issues…");
    try {
      const list = await invoke("listRecentIssues", { projectKey });
      console.log("[UI] listRecentIssues result", list);
      const safe = Array.isArray(list) ? list.filter((x) => x && x.key) : [];
      setIssues(safe);
      setMsg(safe.length ? "" : "No recent issues found for this project.");
    } catch (e) {
      console.error("[UI] listRecentIssues error", e);
      setMsg(`Search error: ${e?.message || e}`);
      setIssues([]);
    }
  };

  const chooseIssue = (key) => {
    console.log("[UI] chooseIssue", key);
    setIssueKey(key);
    setMsg(
      `Selected ${key}. Now pick a repo and we’ll look for a matching PR.`
    );
  };

  const reset = async () => {
    try {
      await invoke("resetAuth");
      setSaved(false);
      setToken("");
      setSecret("");
      setIssueKey("");
      setRepos([]);
      setSelected(null);
      setPr(null);
      setIssues([]);
      setProjectKey("");
      setMsg("Credentials cleared.");
    } catch (e) {
      setMsg(`Reset error: ${e?.message || e}`);
    }
  };

  return (
    <Stack space="large">
      <Text size="xlarge">GitHub ↔ Jira (Forge Admin Page)</Text>

      {!saved && (
        <SectionMessage title="Auth" appearance="information">
          <Stack space="small">
            <Text>
              Save your GitHub Personal Access Token and Webhook Secret.
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
              <Button appearance="primary" onClick={save}>
                Save
              </Button>
            </Inline>
          </Stack>
        </SectionMessage>
      )}

      {saved && (
        <SectionMessage
          title="Pick or create a Jira issue"
          appearance="information"
        >
          <Stack space="small">
            <Text>
              Enter your Project key (e.g., KAN), then either create a test
              issue or list recent ones and click to select.
            </Text>
            <Textfield
              name="project-key"
              placeholder="Project key (e.g., KAN)"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
            />
            <Inline space="small">
              <Button onClick={loadRecentIssues}>List recent issues</Button>
              <Button appearance="primary" onClick={createTestIssue}>
                Create test issue
              </Button>
            </Inline>

            {issues?.length > 0 && (
              <Stack space="none">
                {issues.map((it) => (
                  <Text key={it.key} onClick={() => chooseIssue(it.key)}>
                    {it.key} — {it.summary || "(no summary)"}
                  </Text>
                ))}
              </Stack>
            )}
            <Inline space="small">
              <Button
                appearance="subtle"
                onClick={() => {
                  console.log("[UI] back to Auth");
                  setSaved(false);
                  setRepos([]);
                  setSelected(null);
                  setPr(null);
                  setMsg("");
                }}
              >
                Back
              </Button>
              <Button appearance="warning" onClick={reset}>
                Reset credentials (clear storage)
              </Button>
            </Inline>
          </Stack>
        </SectionMessage>
      )}
      {saved && (
        <SectionMessage title="Connected" appearance="confirmation">
          <Stack space="small">
            <Textfield
              name="issue"
              placeholder="Issue Key (e.g., KAN-1)"
              value={issueKey}
              onChange={(e) => setIssueKey(e.target.value)}
            />
            <Inline space="small">
              <Button onClick={loadRepos}>Load my repos</Button>
            </Inline>
            {Array.isArray(repos) && repos.length > 0 && (
              <Stack space="none">
                {repos.map((r) => (
                  <Text key={r.id}>
                    {r.full_name}{" "}
                    <Button onClick={() => pickRepo(r.full_name)}>
                      Select
                    </Button>
                  </Text>
                ))}
              </Stack>
            )}
            {selected && pr === null && (
              <Text>Have no opened pull requests.</Text>
            )}
            {selected && pr && (
              <SectionMessage
                title="Matched Pull Request"
                appearance="information"
              >
                <Stack space="small">
                  <Text>
                    <Link href={pr.html_url} openNewTab>
                      {pr.title || pr.html_url}
                    </Link>
                  </Text>
                  <Inline space="small">
                    <Button onClick={approve}>Approve</Button>
                    <Button appearance="primary" onClick={merge}>
                      Merge
                    </Button>
                  </Inline>
                </Stack>
              </SectionMessage>
            )}
            {!!msg && <Text>{msg}</Text>}(
            <Inline space="small">
              <Button
                appearance="subtle"
                onClick={() => {
                  console.log("[UI] back to Auth");
                  setSaved(false);
                  setRepos([]);
                  setSelected(null);
                  setPr(null);
                  setMsg("");
                }}
              >
                Back
              </Button>
            </Inline>
            )
          </Stack>
        </SectionMessage>
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
