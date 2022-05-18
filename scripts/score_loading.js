let DATA = {}
async function updateData(reload) {
  const fetch = reload ? fetchWithCache : cacheWithFetch;
  const [usernames, scores, meta] = await Promise.all([
    fetch(USERNAMES_API).then(response => response.text()),
    fetch(SCORE_API).then(response => response.text()),
    fetch(META_API).then(response => response.text()),
  ]);

  const levels = getLevelsData(scores, meta);
  const players = getPlayersData(levels, usernames);
  DATA = {levels, players};
  return DATA;
}

function parseCsv(text) {
  return text.trim().split('\n').map(row => row.split(',').map(tryParseInt));
}

function getPlayersData(levelsData, usernames_raw) {
  const players = {};
  for (const [player_id, name] of parseCsv(usernames_raw)) {
    players[player_id] = {id: player_id, name, levels: levelsData.sorted.map(level => ({id: level.id, solved: level.solvers.has(player_id)}))};
  }
  
  console.log("Read " + Object.keys(players).length + " usernames");
  return players;
}

function getLevelsData(scores_raw, meta) {
  const levels = {sorted: [], by_id: {}};
  for (const [enum_number, level_id, title, is_architecture, no_score] of parseCsv(meta)) {
    const level = {
      id: level_id,
      name: title,
      arch: is_architecture === "true",
      scored: no_score === "false",
      solvers: new Set(),
      scores: {},
    };
    levels.by_id[level_id] = level;
    levels.sorted.push(level);
  }
  console.log("Read " + levels.sorted.length + " levels");
  
  const scores = parseCsv(scores_raw);
  for (const [user_id, level_id, gate, delay, tick, score_type_id] of scores) {
    const score_type = SCORE_TYPES[score_type_id]
    levels.by_id[level_id].scores[score_type] = levels.by_id[level_id].scores[score_type] || [];
    levels.by_id[level_id].scores[score_type].push({
      solver: user_id,
      gate: gate,
      delay: delay,
      tick: tick,
      sum: gate + delay + tick,
    });
    levels.by_id[level_id].solvers.add(user_id);
  }
  for (const level of levels.sorted) {
    for (const score_type of SCORE_TYPES) {
      if (!(score_type in level)) continue;
      level.scores[score_type].sort((score1, score2) => score1[score_type] - score2[score_type])
    }
  }
  console.log("Read " + scores.length + " scores");
  return levels;
}