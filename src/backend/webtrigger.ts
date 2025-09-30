export const run = async (req: any) => {
  // TODO: verify X-Hub-Signature-256, parse body, handle PR merged
  return { statusCode: 200, body: "ok" };
};
