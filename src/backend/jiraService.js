import { asApp, asUser, route } from "@forge/api";

const jira = (url, init) => asApp().requestJira(url, init);
const jiraUser = (url, init) => asUser().requestJira(url, init);

export const getIssue = async (key) => {
  const r = await jiraUser(route`/rest/api/3/issue/${key}`);
  if (!r.ok) throw new Error(`Jira ${r.status}: ${await r.text()}`);
  return r.json();
};

export const listTransitions = async (key) => {
  const r = await jira(route`/rest/api/3/issue/${key}/transitions`);
  if (!r.ok) throw new Error(`Jira ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.transitions || [];
};

export const transitionToDone = async (key) => {
  const transitions = await listTransitions(key);
  const done = transitions.find((t) => /done/i.test(t.name));
  if (!done) throw new Error('No "Done" transition available for this issue');

  const r = await jira(route`/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: `{"transition":{"id":"${done.id}"}}`,
  });
  if (!r.ok)
    throw new Error(`Jira transition failed: ${r.status} ${await r.text()}`);
  return true;
};
