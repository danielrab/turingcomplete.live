const USERNAMES_API = "https://turingcomplete.game/api_usernames";
const SCORE_API = "https://turingcomplete.game/api_score";
const META_API = "https://turingcomplete.game/api_level_meta";
const user_ids = {};
const levels = {};
const metadata = {};
let load_complete = false;
let viewing_cached_data = false;
let staleCacheInterval = 0;

window.addEventListener("hashchange", () => {
  loadHashPage();
});
window.onload = () => {
  $('#title').html("Downloading scores...")
  refreshApiData({pageLoad: true});
};
google.charts.load("current", {
  packages: ["corechart"]
});

function tryParseInt(val) {
  return isNaN(parseInt(val)) ? val : parseInt(val)
}

function parseCsv(text) {
  return text.split('\n').filter(s => s).map(row => row.split(',').map(tryParseInt));
}

function parseHashParams(hash) {
  const raw_params = hash.replace(/^#/, '').split(';');
  const params = {other: ''};
  for (const raw_param of raw_params) {
    let match = raw_param.match(/(.+?)=(.+)/);
    if (match) {
      params[match[1]] = tryParseInt(match[2]);
    } else {
      params.other = raw_param;
    }
  }
  if (!params.type) {
    if (params.other in levels) {
      params.type = 'level';
      params.id = params.other;
    } else if (params.other in user_ids) {
      params.type = 'player';
      params.id = params.other;
    } else if (params.other){
      params.type = params.other;
    }
  }
  delete params.other;
  return params;
}

function encodeParams(params) {
  return Object.entries(params).map(([param, value]) => `${param}=${value}`).join(';').replace('other=', '');
}

// ---------------------------------------------------------
function loadHashPage() {
  const params = parseHashParams(window.location.hash)
  if (params.type == 'player') return showPlayer(params);
  if (params.type == 'level') return showLevel(params);
  if (params.type == "top_players") return showTopPlayers(params);
  return showLevels();
}

// ---------------------------------------------------------
function levelName(level_id) {
  return metadata[level_id]?.name || level_id;
}

function playerName(player_id) {
  return user_ids[player_id] || player_id;
}

function placeMedal(place) {
  const medals = {
    1: "\u{1f947}",
    2: "\u{1f948}",
    3: "\u{1f949}",
  }
  return medals[place] || place;
}

// ---------------------------------------------------------
function activateOverviewButton() {
  activateButton("Level Overview", {type:'overview'});
}

function activateTopPlayersButton(min_solvers) {
  activateButton("Top Players", {type:"top_players", min_solvers});
}

function activateLevelButton(level_id) {
  activateButton(levelName(level_id), {other:level_id});
}

function activatePlayerButton(player_id) {
  activateButton(playerName(player_id), {other:player_id});
}

function activateButton(text, params={}) {
  const query = Object.keys(params).map(p => `[param_${p}="${params[p]}"]`).join('')
  $('.btn-primary').removeClass('btn-primary').addClass('btn-outline-primary');
  const button = $(`button${query}`)[0] || createButton(text, params)[0];
  $(button).addClass("btn-primary").removeClass('btn-outline-primary');
}

function createButton(text, params) {
  const button = $(`<button class="btn btn-primary">${text}</button>`)
          .on('click', () => window.location.hash=encodeParams(params))
          .appendTo('#button-container')
  for (const param in params) {
    button.attr(`param_${param}`, params[param]);
  }
  return button;
}

// ---------------------------------------------------------
function readBookmarks() {
  let bookmarks = localStorage.getItem("bookmarks") || "flood_predictor;6";
  bookmarks = bookmarks?.split(/;/) || [];
  return bookmarks.filter(e => e);
}

function createBookmark(bookmark) {
  const bookmarks = readBookmarks();
  const className = bookmarks.includes(bookmark) ? "bi-bookmark-star" : "bi-bookmark";
  return $(`<i id="bookmark_${bookmark}" role="img" aria-label="Bookmark" class="bi ${className}"></i>`)
          .on('click', () => toggleBookmark(bookmark))
}

function bookmarkSort(x, y) {
  const a = isNaN(parseInt(x));
  const b = isNaN(parseInt(y));
  return (a == b) ? (x - y) : (a - b);
}

function toggleBookmark(bookmark) {
  const i = document.getElementById(`bookmark_${bookmark}`);
  let bookmarks = readBookmarks();
  if (bookmarks.includes(bookmark)) {
    bookmarks = bookmarks.filter(b => b != bookmark);
    i.className = "bi bi-bookmark";
  } else {
    bookmarks.push(bookmark);
    bookmarks.sort(bookmarkSort);
    i.className = "bi bi-bookmark-star";
  }
  if (bookmarks.length == 0) {
    localStorage.removeItem("bookmarks");
  } else {
    localStorage.setItem("bookmarks", bookmarks.join(";"));
  }
}

function loadBookmarks() {
  const bookmarks = readBookmarks();
  const container = document.getElementById("button-container");
  for (b in bookmarks) {
    const bookmark = bookmarks[b];
    if (document.getElementById("btn_" + bookmark)) continue;
    if (!isNaN(parseInt(bookmark)) && Object.keys(user_ids).includes(bookmark)) {
      const player_name = playerName(bookmark);
      const button = createButton(player_name, {other:bookmark})[0];
      container.appendChild(button);
    } else if (Object.keys(levels).includes(bookmark)) {
      const level_name = levelName(bookmark);
      const button = createButton(level_name, {other:bookmark})[0];
      container.appendChild(button);
    } else {
      // console.log("Ignoring unrecognized bookmark: " + bookmark);
    }
  }
}

// ---------------------------------------------------------
function apiCacheAge() {
  const updated = localStorage.getItem("updated") || 0;
  const elapsed = Date.now() - updated;
  return elapsed;
}

function apiCacheUpdated() {
  localStorage.setItem("updated", Date.now());
  clearStaleCacheTime();
}

function updateStaleCacheTime() {
  const elapsed = apiCacheAge();
  const hours = Math.floor(elapsed / 1000 / 60 / 60);
  if (hours > 0) {
    const color = (hours == 1 ? "success" : hours < 8 ? "warning" : "danger");
    const title = hours + (hours == 1 ? " hour ago" : " hours ago");
    updateRefreshButton(color, title);
  }
}

function updateRefreshButton(color, title) {
  const refresh = document.getElementById("btn_refresh");
  const refreshLabel = document.getElementById("lbl_refresh");
  refresh.className = "btn btn-" + color;
  refresh.setAttribute("title", title);
  refreshLabel.innerText = title;
}

function clearStaleCacheTime() {
  updateRefreshButton("outline-primary", "");
}

function setStaleCacheInterval() {
  staleCacheInterval = setInterval(updateStaleCacheTime, 10 * 1000);
}

function clearStaleCacheInterval() {
  if (staleCacheInterval) {
    clearInterval(staleCacheInterval);
    staleCacheInterval = 0;
  }
}

// ---------------------------------------------------------
async function refreshApiData({pageLoad=false}={}) {
  $('i[aria-label="Refresh"]').addClass('spin')
  viewing_cached_data = false;
  clearStaleCacheInterval();
  clearStaleCacheTime();

  const cacheTooOld = (apiCacheAge() > /*8 hours*/ 1000 * 60 * 60 * 8);
  if (pageLoad && cacheTooOld) {
    updateStaleCacheTime();
  }
  try {
    const [usernames, scores, level_meta] = await loadApiData(!pageLoad || cacheTooOld);
    if (viewing_cached_data) {
      updateStaleCacheTime();
    } else {
      apiCacheUpdated();
    }
    setStaleCacheInterval();
    handleUsernames(usernames);
    handleScores(scores);
    handleLevelMeta(level_meta);
    if (pageLoad && !cacheTooOld) {
      loadBookmarks();
    }
    loadHashPage();
  } 
  catch (error) {
    const refresh = document.getElementById("btn_refresh");
    refresh.className = "btn btn-danger";
    const title = document.createElement("h2");
    const titleText = document.createTextNode("Failed to load: " + error);
    title.appendChild(titleText);
    const pre = document.createElement("pre");
    const preText = document.createTextNode(error.stack);
    pre.appendChild(preText);
    document.getElementById("content").replaceChildren(title, pre);
  }
  $('i[aria-label="Refresh"]').removeClass('spin')
}

// ---------------------------------------------------------
async function loadApiData(reload) {
  const fetch = reload ? fetchWithCache : cacheWithFetch;
  return Promise.all([
    fetch(USERNAMES_API).then(response => response.text()),
    fetch(SCORE_API).then(response => response.text()),
    fetch(META_API).then(response => response.text()),
  ]);
}

// ---------------------------------------------------------
async function fetchWithCache(url) {
  const cache = await caches.open("scores");
  let cache_updated = false;
  try {
    console.log("Fetching: " + url);
    const response = await fetch(url);
    if (response && response.ok) {
      await cache.put(url, response);
      cache_updated = true;
    } else {
      console.log("Bad response: " + url);
    }
  } catch (error) {
    console.log("Fetch failed: " + url);
  }
  if (!cache_updated) viewing_cached_data = true;
  return cache.match(url);
}

async function cacheWithFetch(url) {
  const cache = await caches.open("scores");
  const cachedResponse = await cache.match(url);
  if (cachedResponse && cachedResponse.ok) {
    console.log("Cached: " + url);
    viewing_cached_data = true;
    return cachedResponse;
  }
  console.log("Fetching: " + url);
  await cache.add(url);
  return await cache.match(url);
}

// ---------------------------------------------------------
function handleUsernames(data) {
  // Server id to username relationship
  const parsedData = parseCsv(data);
  for (const [id, name] of parsedData) {
    user_ids[id] = name;
  }
  console.log("Read " + parsedData.length + " usernames");
}

function handleScores(data) {
  // Server scores (user_id, level_id, gate, delay, tick, score_type)
  const parsedData = parseCsv(data);
  for (const [user_id, level_id, gate, delay, tick, score_type] of parsedData) {
    if (!(level_id in levels)) {
      levels[level_id] = {};
    }
    if (!(score_type in levels[level_id])) {
      levels[level_id][score_type] = {};
    }
    levels[level_id][score_type][user_id] = {
      gate: gate,
      delay: delay,
      tick: tick,
      sum: gate + delay + tick,
    };
  }
  console.log("Read " + parsedData.length + " scores");
}

function handleLevelMeta(level_meta) {
  // Meta data for levels (enum_number, enum_id, title, is_architecture, no_score).
  // The order here is the same as on player profiles.
  const parsedData = parseCsv(level_meta);
  let meta_count = 0;
  for (const [enum_number, level_id, title, is_architecture, no_score] of parsedData) {
    metadata[level_id] = {
      sort_key: parseInt(meta_count++),
      name: title,
      arch: is_architecture === "true",
      scored: no_score === "false",
    };
  }
  console.log("Read " + parsedData.length + " levels");
}

// ---------------------------------------------------------
function calculateMedian(list) {
  list.sort((a, b) => a - b);
  const middle = (list.length - 1) / 2;
  return (list[Math.floor(middle)] + list[Math.ceil(middle)]) / 2
}

// ---------------------------------------------------------
function showLevels() {
  activateOverviewButton();
  document.title = "TC Leaderboard - Level Overview";
  const heading = "Level Overview";
  const headers = [
    "Level",
    "Solvers",
    "First",
    "Best",
    "Median",
  ];
  const rows = [];
  
  const sorted_levels = Object.keys(levels)
    .sort((x, y) => metadata[x].sort_key - metadata[y].sort_key);
  const bookmarks = readBookmarks();
  for (level_id in sorted_levels) {
    level_id = sorted_levels[level_id];
    const level_name = levelName(level_id);
    const level_version = metadata[level_id].version;
    const all_solvers = Object.keys(levels[level_id][0]);
    const solvers = all_solvers.filter(s => levels[level_id][0][s].version == level_version);
    const sums = solvers.map(x => levels[level_id][0][x].sum);
    const scored = metadata[level_id].scored;
    const num_solvers = all_solvers.length;
    let min, median, first;
    if (scored) {
      min = Math.min(...sums);
      median = calculateMedian(sums);
      first = solvers.filter(s => levels[level_id][0][s].sum <= min);
      if (first.length == 1) {
        first = playerName(first[0]);
      } else {
        first = first.length;
      }
    } else {
      min = "-";
      median = "-";
      first = "-";
    }

    const level = {
      href: "#" + encodeParams({other:level_id}),
      text: level_name,
    };
    if (bookmarks.includes(level_id)) {
      level.img = "bi bi-star";
    }
    rows.push([
      scored ? level : level_name,
      num_solvers,
      first,
      min,
      median,
    ]);
  }

  renderPage(heading, null, headers, rows);
}

// ---------------------------------------------------------
function showTopPlayers({entries=100, min_solvers=0}={}) {
  activateTopPlayersButton(min_solvers);
  document.title = "TC Leaderboard - Top Players";
  const heading = "Total combined scores";

  const top_levels = Object.keys(levels)
    .filter(l => metadata[l].scored) // Scored
    .filter(l => Object.keys(levels[l][0]).length > min_solvers); // More than min_solves solvers

  showTopLevels(heading, top_levels, entries);
}

function getHistogram(data) {
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue(darkmode.inDarkMode ? "--bs-light" : "--bs-dark");
  const bgColor = style.getPropertyValue(darkmode.inDarkMode ? "--bs-bg-color-alt" : "--bs-bg-color");
  const options = {
    width: Math.min(1050, window.innerWidth * 0.90),
    height: 500,
    chartArea: {
      left: 20,
      top: 0,
      width: "95%",
      height: "85%",
    },
    legend: {
      position: "none",
    },
    hAxis: {
      slantedText: true,
      slantedTextAngle: -60,
      textStyle: {
        color: textColor,
      },
    },
    vAxis: {
      gridlines: {
        count: 2,
      }
    },
    backgroundColor: bgColor,
    histogram: {
      bucketSize: 1,
      maxNumBuckets: Math.min(50, data.length),
    },
  };

  const plotContainer = $('<div></div>');
  const chart = new google.visualization.Histogram(plotContainer[0]);
  const dataTable = google.visualization.arrayToDataTable(data);
  chart.draw(dataTable, options);
  return plotContainer;
}

function showTopLevels(heading, top_levels, entries) {
  entries = parseInt(entries);
  const headers = ["Player", "Place", "levels", "gate", "delay", "tick", "sum"];
  const rows = [];

  const bookmarks = readBookmarks();
  let results = Object.keys(user_ids).map(function(player_id) {
    const player = {
      href: "#" + encodeParams({other:player_id}),
      text: playerName(player_id),
    };
    if (bookmarks.includes(player_id)) {
      player.img = "bi bi-star";
    }
    const s = top_levels
      .filter(l => player_id in levels[l][0])
      .filter(l => levels[l][0][player_id].version == metadata[l].version)
      .map(l => levels[l][0][player_id]);
    return {
      player: player,
      solved: s.length,
      gate: s.reduce((sum, b) => sum + b.gate, 0),
      delay: s.reduce((sum, b) => sum + b.delay, 0),
      tick: s.reduce((sum, b) => sum + b.tick, 0),
      sum: s.reduce((sum, b) => sum + b.sum, 0),
    };
  }).sort((x, y) => ((x.solved === y.solved) ? (x.sum - y.sum) : (y.solved - x.solved)));

  let num_results = 0;
  let place = 1;
  let data = [
    ["player", "sum"]
  ];
  for (const r in results) {
    if (++num_results > entries) break; // Only show 100 results

    const result = results[r];

    if (r > 0) {
      const result_above = results[r - 1];
      const sum = result.sum;
      const sum_above = result_above.sum;
      if (sum != sum_above) {
        place = num_results;
      }
    }

    rows.push([
      result.player,
      placeMedal(place),
      result.solved,
      result.gate,
      result.delay,
      result.tick,
      result.sum,
    ]);
  }

  // Only show players who have solved all levels in the histogram
  results = results.filter(r => r.solved == top_levels.length);
  const p90 = results[Math.floor(results.length * 0.90)];
  const sum_limit = p90.sum / 0.90;
  for (const r in results) {
    const result = results[r];
    if (result.sum >= sum_limit) break;
    data.push([
      result.player.text,
      result.sum,
    ]);
  }

  const plotContainer = getHistogram(data);
  renderPage(heading, null, headers, rows, plotContainer);
}

// ---------------------------------------------------------
function showLevel({id, mode, entries=100}) {
  mode = mode || 'sum';
  const modes = ["sum", "gate", "delay", "tick"]
  const mode_id = modes.indexOf(mode);

  activateLevelButton(id);
  const level_name = levelName(id);
  document.title = "TC Leaderboard - " + level_name;
  const heading = "Leaderboard for " + level_name;
  const bookmark = createBookmark(id)[0];
  const headers = ["Player", "Place", "gate", "delay", "tick", "sum"];
  for (header_mode of modes) {
    if (header_mode != mode && modes.indexOf(header_mode) in levels[id]) {
      headers[headers.indexOf(header_mode)] = {
        text: header_mode,
        href: "#" + encodeParams({other:id, mode:header_mode})
      }
    }
  }
  const rows = [];

  let board_sort = ([x, a], [y, b]) => a[mode] - b[mode] || a.sum - b.sum;
  const sorted_solvers = Object.entries(levels[id][mode_id]).sort(board_sort);

  const bookmarks = readBookmarks();
  const ticksScored =
    metadata[id].scored &&
    metadata[id].arch;
  for (const s in sorted_solvers.slice(0, entries)) {
    const place = parseInt(s) + 1;
    const [solver_id, solver] = sorted_solvers[s];
    const solver_name = playerName(solver_id);

    const player = {
      href: "#" + encodeParams({other:solver_id}),
      text: solver_name,
    };
    if (bookmarks.includes(solver_id)) {
      player.img = "bi bi-star";
    }
    const row = [
      player,
      placeMedal(place),
      solver.gate,
      solver.delay,
      ticksScored ? solver.tick : "-",
      solver.sum,
    ];
    rows.push(row);
  }
  const p90 = sorted_solvers[Math.floor(sorted_solvers.length * 0.90)];
  const data = [["solver", mode]];
  const first = sorted_solvers[0][1][mode];
  const p90m = p90[1][mode];
  const limit = (p90m == first) ? 99999 : Math.min(99999, p90m / 0.90);
  for (const s in sorted_solvers) {
    const [solver_id, solver] = sorted_solvers[s];
    const solver_name = playerName(solver_id);
    const metric = solver[mode];
    if (metric >= limit) break;
    data.push([
      solver_name,
      metric,
    ]);
  }

  const plotContainer = getHistogram(data)
  renderPage(heading, bookmark, headers, rows, plotContainer);
}

// ---------------------------------------------------------
function showPlayer({id}) {
  activatePlayerButton(id);
  const player_name = playerName(id);
  document.title = "TC Leaderboard - " + player_name;
  const heading = "Stats for " + player_name;
  const bookmark = createBookmark(id)[0];
  const headers = ["Level", "Place", "# tied", "gate", "delay", "tick", "sum"];
  const rows = [];

  const sorted_levels = Object.keys(levels)
    .sort((x, y) => metadata[x].sort_key - metadata[y].sort_key);
  const bookmarks = readBookmarks();
  const medals = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  for (const l in sorted_levels) {
    const level_id = sorted_levels[l];
    const level_name = levelName(level_id);
    const level_version = metadata[level_id].version;
    let place = "-",
      ties = "-",
      gate = "-",
      delay = "-",
      tick = "-",
      sum = "-";
    const solved = (id in levels[level_id][0]);
    const solves = Object.keys(levels[level_id][0])
      .map(x => levels[level_id][0][x]);
    const ticksScored =
      metadata[level_id].scored &&
      metadata[level_id].arch;
    const scored =
      metadata[level_id].scored;
    if (solved && scored) {
      const player_score = levels[level_id][0][id];
      gate = player_score.gate;
      delay = player_score.delay;
      if (ticksScored) {
        tick = player_score.tick;
      }
      sum = player_score.sum;
      ties = solves
        .filter(x => x.sum == sum)
        .length;
      if (ties == 1) ties = "-";
      if (player_score.version == level_version) {
        place = solves
          .filter(x => x.sum < sum)
          .filter(x => x.version == level_version)
          .length + 1;
      }
    } else if (solved) {
      place = "\u2705";
      medals[4]++;
    } else {
      place = "\u{1F7E8}";
      medals[5]++;
    }
    const level = {
      href: "#" + encodeParams({other:level_id}),
      text: level_name,
    };
    if (bookmarks.includes(level_id)) {
      level.img = "bi bi-star";
    }
    if (parseInt(place) <= 3) {
      medals[place]++;
    }
    place = placeMedal(place);
    rows.push([
      scored ? level : level_name,
      place,
      ties,
      gate,
      delay,
      tick,
      sum
    ]);
  }
  const container = $('<div></div>');
  $(`<div><img class="rounded" src="https://turingcomplete.game/avatars/${id}.jpg"></div>`)
    .appendTo(container);

  const medalsText = Object.entries(medals)
    .filter(([place, count]) => count > 0)
    .map(([place, count]) => `${place == 4 ? "\u2705" : place == 5 ? "\u{1F7E8}" : placeMedal(place)}x${count}`)
    .join(' ');
  $(`<div>${medalsText}</div>`)
    .appendTo(container);

  $(`<a href="https://turingcomplete.game/profile/${id}">${player_name}'s Profile [turingcomplete.game]</a>`)
    .appendTo(container);

  renderPage(heading, bookmark, headers, rows, container);
}

// ---------------------------------------------------------
function textOrLink(obj) {
  if (["string", "number"].includes(typeof obj)) return obj;
  if ("href" in obj) return $(`<a href="${obj.href}">${obj.text}</a>`)
  return obj.text;
}

function renderTable(headers, rows) {
  const tblBody = $('#main_table > tbody').empty();
  const tblHead = $('#main_table > thead').empty();

  const row = $('<tr></tr>');
  for (const h of headers) {
    $(`<th class="text-center collumn_${h?.text||h}"></th>`)
      .append(textOrLink(h))
      .appendTo(row);
  }
  tblHead.append(row);

  for (const r in rows) {
    const rows_r = rows[r];
    const row = $('<tr></tr>');

    for (const c in rows_r) {
      const rows_rc = rows_r[c];
      const cell = $(`<td class="collumn_${headers[c]?.text||headers[c]}"></td>`);
      if (["string", "number"].includes(typeof rows_rc)) {
        cell.append(rows_rc);
        if (typeof rows_rc == "number" || [...rows_rc].length == 1 && /^\p{Emoji}$/u.test(rows_rc)) {
          cell.addClass('text-end');
        }
      } else {
        cell.append(textOrLink(rows_rc));
        if ("img" in rows_rc) {
          cell.append(" ");
          $(`<i class="${rows_rc.img}"></i>`).appendTo(cell);
        }
      }
      row.append(cell);
    }

    tblBody.append(row);
  }
}

function renderPage(heading, bookmark, headers, rows, extra='') {
  $('#title').html(heading).append(bookmark);
  $('#extra').html(extra);
  renderTable(headers, rows);
}