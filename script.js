const form = document.getElementById("add-form");
const input = document.getElementById("youtube-url");
const clearInputBtn = document.getElementById("clear-input");
const grid = document.getElementById("video-grid");
const emptyState = document.getElementById("empty-state");
const message = document.getElementById("message");
const clearAll = document.getElementById("clear-all");
const shareWallBtn = document.getElementById("share-wall");
const layoutButtons = document.querySelectorAll(".layout-btn");
const countLabel = document.getElementById("count-label");

const playAllBtn = document.getElementById("play-all");
const pauseAllBtn = document.getElementById("pause-all");
const muteAllBtn = document.getElementById("mute-all");
const unmuteAllBtn = document.getElementById("unmute-all");

const MAX_PLAYERS = 30;
let videos = [];
let currentColumns = 1;
let draggedIndex = null;
let isGlobalMuted = false;
let isGlobalPlaying = false;

const updateClearInputVisibility = () => { clearInputBtn.hidden = !input.value.trim(); };

function extractYouTubeId(rawInput) {
  if (!rawInput) return null;
  const str = rawInput.trim();

  if (/^[A-Za-z0-9_-]{11}$/.test(str)) {
    return { id: str, isShort: false };
  }

  try {
    const url = new URL(/^https?:\/\//i.test(str) ? str : `https://${str}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, isShort: false } : null;
    }

    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, isShort: false } : null;
      }
      
      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/")[2];
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? { id, isShort: true } : null;
      }

      const match = url.pathname.match(/\/(live|embed)\/([A-Za-z0-9_-]{11})/);
      if (match?.[2]) return { id: match[2], isShort: false };
    }
  } catch {}

  return null;
}

function setMessage(text = "", isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function updateLayoutClass() {
  grid.className = `video-grid cols-${currentColumns}`;
  layoutButtons.forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.cols) === currentColumns);
  });
}

function saveState() {
  const formattedItems = videos.map(v => v.isShort ? `${v.id}:s` : v.id);
  
  try {
    localStorage.setItem("lumzo_videos", JSON.stringify(formattedItems));
    localStorage.setItem("lumzo_cols", currentColumns);
  } catch (e) {
    console.warn("LocalStorage save failed:", e);
  }

  const url = new URL(window.location.href);
  if (formattedItems.length > 0) {
    url.searchParams.set("cols", currentColumns);
    url.searchParams.set("v", formattedItems.join(","));
  } else {
    url.searchParams.delete("cols");
    url.searchParams.delete("v");
  }

  try {
    window.history.replaceState({}, "", url.toString());
  } catch (e) {
    console.warn("URL history sync failed:", e);
  }
}

function loadState() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlVideos = urlParams.get("v");
  const urlCols = urlParams.get("cols");

  let itemsToLoad = [];

  if (urlVideos) {
    itemsToLoad = urlVideos.split(",").filter(Boolean);
    if (urlCols && [1, 2, 3, 4, 5].includes(Number(urlCols))) {
      currentColumns = Number(urlCols);
    }
  } else {
    try {
      const storedVideos = localStorage.getItem("lumzo_videos");
      const storedCols = localStorage.getItem("lumzo_cols");

      if (storedCols && [1, 2, 3, 4, 5].includes(Number(storedCols))) {
        currentColumns = Number(storedCols);
      }

      if (storedVideos) {
        const parsed = JSON.parse(storedVideos);
        if (Array.isArray(parsed)) itemsToLoad = parsed;
      }
    } catch (e) {
      console.warn("LocalStorage load failed:", e);
    }
  }

  videos = itemsToLoad.slice(0, MAX_PLAYERS).map(item => {
    const [id, flag] = item.split(":");
    return {
      id,
      isShort: flag === "s",
      instanceId: `player-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      isLoaded: false
    };
  });
}

function sendCommandToAllIframes(func, args = "") {
  grid.querySelectorAll("iframe").forEach(iframe => {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  });
}

function mountIframe(card, video, autoPlay = true) {
  card.querySelector(".card-facade")?.remove();

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=${autoPlay ? 1 : 0}&rel=0`;
  iframe.title = `YouTube video ${video.id}`;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.loading = "lazy";
  
  card.classList.add("is-loading");
  iframe.addEventListener("load", () => card.classList.remove("is-loading"), { once: true });

  card.appendChild(iframe);
  video.isLoaded = true;
}

function render() {
  updateLayoutClass();
  grid.replaceChildren();

  if (countLabel) {
    countLabel.textContent = `${videos.length} / ${MAX_PLAYERS} players`;
  }

  emptyState.style.display = videos.length ? "none" : "grid";

  videos.forEach((video, index) => {
    const card = document.createElement("article");
    card.className = `video-card ${video.isShort ? "is-short" : ""}`;
    card.dataset.instanceId = video.instanceId;
    card.draggable = true;

    // Drag & Drop
    card.addEventListener("dragstart", (e) => {
      draggedIndex = index;
      card.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      grid.querySelectorAll(".video-card").forEach(c => c.classList.remove("drag-over"));
    });

    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drag-over");
    });

    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (draggedIndex !== null && draggedIndex !== index) {
        const movedItem = videos.splice(draggedIndex, 1)[0];
        videos.splice(index, 0, movedItem);
        saveState();
        render();
      }
    });

    const header = document.createElement("div");
    header.className = "card-header";

    const label = document.createElement("span");
    label.className = `card-label ${video.isShort ? "short-label" : ""}`;
    label.textContent = video.isShort ? `⚡ SHORT ${String(index + 1).padStart(2, "0")}` : `VIDEO ${String(index + 1).padStart(2, "0")}`;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const fullscreen = document.createElement("button");
    fullscreen.className = "card-btn";
    fullscreen.type = "button";
    fullscreen.title = "Fullscreen";
    fullscreen.ariaLabel = "Fullscreen";
    fullscreen.textContent = "⛶";
    fullscreen.addEventListener("click", () => {
      const activeIframe = card.querySelector("iframe");
      (activeIframe || card).requestFullscreen?.();
    });

    const remove = document.createElement("button");
    remove.className = "card-btn";
    remove.type = "button";
    remove.title = "Remove";
    remove.ariaLabel = "Remove video";
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      videos = videos.filter(v => v.instanceId !== video.instanceId);
      saveState();
      render();
      setMessage(videos.length ? `${videos.length} video${videos.length === 1 ? "" : "s"} on the wall.` : "");
    });

    actions.append(fullscreen, remove);
    header.append(label, actions);

    const footer = document.createElement("div");
    footer.className = "card-footer";
    footer.textContent = video.isShort ? "YouTube Shorts" : "YouTube";

    card.append(header, footer);

    if (video.isLoaded) {
      mountIframe(card, video, false);
    } else {
      const facade = document.createElement("button");
      facade.className = "card-facade";
      facade.type = "button";
      facade.ariaLabel = "Play video";
      facade.style.backgroundImage = `url('https://img.youtube.com/vi/${video.id}/hqdefault.jpg')`;

      const playBadge = document.createElement("span");
      playBadge.className = "play-badge";
      playBadge.textContent = "▶";

      facade.appendChild(playBadge);
      facade.addEventListener("click", () => mountIframe(card, video, true));
      card.appendChild(facade);
    }

    grid.appendChild(card);
  });
}

// Keyboard Shortcuts
document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (isGlobalPlaying) {
      sendCommandToAllIframes("pauseVideo");
      setMessage("Paused all videos.");
    } else {
      videos.forEach(video => {
        const card = grid.querySelector(`[data-instance-id="${video.instanceId}"]`);
        if (card && !video.isLoaded) mountIframe(card, video, true);
      });
      sendCommandToAllIframes("playVideo");
      setMessage("Playing all videos.");
    }
    isGlobalPlaying = !isGlobalPlaying;
  } else if (e.code === "KeyM") {
    e.preventDefault();
    sendCommandToAllIframes(isGlobalMuted ? "unMute" : "mute");
    setMessage(isGlobalMuted ? "Unmuted all videos." : "Muted all videos.");
    isGlobalMuted = !isGlobalMuted;
  } else if (e.code === "KeyF" || e.key === "/") {
    e.preventDefault();
    input.focus();
    input.select();
  }
});

// Event Listeners
["input", "paste", "keyup", "change"].forEach(evt => input.addEventListener(evt, updateClearInputVisibility));

clearInputBtn.addEventListener("click", () => {
  input.value = "";
  updateClearInputVisibility();
  setMessage("");
  input.focus();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = extractYouTubeId(input.value);

  if (!result) {
    setMessage("That doesn't look like a valid YouTube video or Shorts URL.", true);
    input.focus();
    return;
  }

  if (videos.length >= MAX_PLAYERS) {
    setMessage(`Wall limit reached: ${MAX_PLAYERS} players.`, true);
    return;
  }

  const instanceId = `player-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  videos.push({ id: result.id, isShort: result.isShort, instanceId, isLoaded: false });

  saveState();
  render();
  updateClearInputVisibility();
  setMessage(`${videos.length} video${videos.length === 1 ? "" : "s"} on the wall.`);
});

layoutButtons.forEach(button => {
  button.addEventListener("click", () => {
    currentColumns = Number(button.dataset.cols);
    saveState();
    updateLayoutClass();
  });
});

playAllBtn.addEventListener("click", () => {
  videos.forEach(video => {
    const card = grid.querySelector(`[data-instance-id="${video.instanceId}"]`);
    if (card && !video.isLoaded) mountIframe(card, video, true);
  });
  sendCommandToAllIframes("playVideo");
  isGlobalPlaying = true;
});

pauseAllBtn.addEventListener("click", () => {
  sendCommandToAllIframes("pauseVideo");
  isGlobalPlaying = false;
});

muteAllBtn.addEventListener("click", () => {
  sendCommandToAllIframes("mute");
  isGlobalMuted = true;
});

unmuteAllBtn.addEventListener("click", () => {
  sendCommandToAllIframes("unMute");
  isGlobalMuted = false;
});

shareWallBtn.addEventListener("click", () => {
  if (!videos.length) {
    setMessage("Add at least one video to generate a shareable link.", true);
    return;
  }
  navigator.clipboard.writeText(window.location.href)
    .then(() => setMessage("Shareable link copied to clipboard! 🔗"))
    .catch(() => setMessage("Failed to copy link. Copy the URL from your browser address bar.", true));
});

clearAll.addEventListener("click", () => {
  videos = [];
  input.value = "";
  saveState();
  updateClearInputVisibility();
  render();
  setMessage("");
  input.focus();
});

// Initialization
loadState();
render();
updateClearInputVisibility();