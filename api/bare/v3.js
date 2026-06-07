import { handleBareRequest } from "../bare.js";

export default async function handler(request, response) {
  await handleBareRequest(request, response);
}
