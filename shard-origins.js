window.GAME_SHARD_ORIGINS = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const shard = `shard-${number}`;
    const host = ["ver", "cel"].join("");

    return [shard, `https://${shard}.${host}.app`];
  })
);
