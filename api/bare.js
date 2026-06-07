import { createBareServer } from "bare-server-node";

const bareServer = createBareServer("/api/bare/");

export async function handleBareRequest(request, response) {
  await bareServer.routeRequest(request, response);
}

export default async function handler(request, response) {
  await handleBareRequest(request, response);
}
