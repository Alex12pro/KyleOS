import { handleProxyRequest } from "../proxy.js";

export default async function handler(request, response) {
  await handleProxyRequest(request, response);
}
