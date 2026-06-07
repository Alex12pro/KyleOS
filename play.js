const frame = document.querySelector("#game-frame");
const titleEl = document.querySelector("#game-title");
const refreshButton = document.querySelector("#refresh");
const fullscreenButton = document.querySelector("#fullscreen");
const params = new URLSearchParams(window.location.search);
const gameId = params.get("game");
const shardOrigins = window.GAME_SHARD_ORIGINS || {};
const recentKey = "nss:recent";

function rememberGame(id) {
  try {
    const current = JSON.parse(localStorage.getItem(recentKey));
    const recent = Array.isArray(current) ? current : [];
    const next = [id, ...recent.filter((item) => item !== id)].slice(0, 12);
    localStorage.setItem(recentKey, JSON.stringify(next));
  } catch {
    localStorage.setItem(recentKey, JSON.stringify([id]));
  }
}

function gameUrl(game) {
  const origin = shardOrigins[game.shard] || "";
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (!origin && isLocal) {
    return `/shards/${game.shard}${game.path}`;
  }

  return `${origin}${game.path}`;
}

async function loadGame() {
  if (!gameId) {
    titleEl.textContent = "Game not found";
    return;
  }

  const response = await fetch("./games.json");
  const data = await response.json();
  const game = data.games.find((item) => item.id === gameId);

  if (!game) {
    titleEl.textContent = "Game not found";
    return;
  }

  titleEl.textContent = game.title;
  document.title = `${game.title} | Kyle OS`;
  rememberGame(game.id);
  frame.src = gameUrl(game);
}

loadGame().catch((error) => {
  titleEl.textContent = "Game not found";
  console.error(error);
});

refreshButton.addEventListener("click", () => {
  if (frame.src) {
    frame.src = frame.src;
  }
});

fullscreenButton.addEventListener("click", async () => {
  const target = frame;

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await target.requestFullscreen();
  } catch {
    window.open(frame.src, "_blank", "noopener,noreferrer");
  }
});
