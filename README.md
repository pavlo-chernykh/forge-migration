# GitHub ↔ Jira (Forge Admin Page)

Forge app for Jira that:

- Stores a **GitHub Personal Access Token (PAT)** and a **Webhook Secret**.
- Lists your **GitHub repositories**, shows **repository details**, and lists **open PRs**.
- Optionally matches a Jira **Issue Key** (e.g., `KAN-1`) in PR **title/branch** and highlights the match.
- Lets you **approve** and **merge** PRs.
- On **merge**, a GitHub **webhook → Forge webtrigger** transitions the Jira issue to **Done**.

## Requirements

- Node 18+ and npm
- Forge CLI & Atlassian cloud developer site — https://developer.atlassian.com/platform/forge/set-up-forge/
- GitHub PAT: `public_repo` (public repos) or `repo` (private repos)

## Manifest (scopes & egress)

    permissions:
      scopes:
        - read:jira-work
        - write:jira-work
        - storage:app
      external:
        fetch:
          backend:
            - address: "https://api.github.com"

## Quick start

1. Install dependencies  
   npm install
2. Deploy the app  
   forge deploy
3. Install on your site  
   forge install --site <your-site>.atlassian.net --product jira
4. Get the Web Trigger URL (for GitHub webhook)  
   forge webtrigger view

## Configure GitHub webhook

- Repo → Settings → Webhooks → Add webhook
  - **Payload URL**: value from `forge webtrigger view` (for the `github-webhook` function)
  - **Content type**: `application/json`
  - **Secret**: any string (you will save the same value in the app UI)
  - **Events**: select **Pull requests** (at minimum) → Save

## Use the app

1. Jira Admin → Manage apps → open this app.
2. **Auth** tab: paste **GitHub PAT** + **Webhook Secret** → Save.
3. **Issue** tab: enter **Project key**, then **List recent issues** or **Create test issue** → click to select.
4. **Connected** tab:
   - (Optional) enter **Issue Key** to filter repos and highlight a matching PR.
   - **Load my repos** → **Select** a repo → view repo details + open PRs.
   - On a PR: **Approve** (disabled for own PR) or **Merge**.
   - When merged, webhook transitions the Jira issue to **Done**.

## Commands

    forge deploy
    forge install --site <site> --product jira
    forge tunnel
    forge webtrigger view
    forge lint

## Notes & Troubleshooting

- Matching rule: `/[A-Z][A-Z0-9_]+-\d+/` (checks PR `title` and `head.ref`).
- Cannot approve own PR → GitHub 422; use a different account.
- Issue 404 → ensure permissions; reads use `asUser()`.
- No creatable issue types when creating test issue → project permissions/scheme.
- Webhook “invalid signature” → GitHub **Secret** must equal the **Webhook Secret** saved in the app.
- Jira search 410 → app falls back from `/rest/api/3/search/jql` to `/rest/api/3/search`.

## Structure

    src/
      frontend/index.jsx        # UI Kit (Auth, Issue list with status chips, Connected)
      backend/githubService.js  # GitHub: repos, PRs, approve, merge, whoAmI
      backend/jiraService.js    # Jira: getIssue (asUser), transitionToDone (asApp)
      backend/storage.js        # save/get PAT + webhook secret (Forge storage:app)
      backend/webtrigger.ts     # verify GitHub signature, transition on merged PR
      resolvers/index.js        # invoke() handlers: listRepos (optional filter by Issue Key), getRepoBundle, listRecentIssues, etc.
    manifest.yml
    README.md

## References

- Forge: https://developer.atlassian.com/platform/forge/
- Jira REST v3 (issue): https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get
- requestJira: https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/requestJira/
- GitHub Repos: https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28
- GitHub Pulls: https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28
- GitHub Merge: https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28#merge-a-pull-request
