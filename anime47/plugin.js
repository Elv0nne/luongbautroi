/**
 * Anime47 provider for SkyStream.
 * Ported from the CloudStream Kotlin plugin `Anime47Provider.kt`.
 *
 * KNOWN LIMITATIONS vs the original CloudStream plugin (see notes at bottom of file):
 *  1. No native "login" settings UI exists in SkyStream the way CloudStream's
 *     PreferenceFragment did, so ANIME47_EMAIL / ANIME47_PASSWORD below must be
 *     filled in manually if the site ever requires an account ("PRIVATE_MODE").
 *  2. The original plugin's `getVideoInterceptor` stripped garbage bytes before
 *     the first MPEG-TS sync byte (0x47) on certain CDN hosts. SkyStream's JS
 *     runtime has no documented hook for rewriting response *bodies* mid-stream
 *     (only header injection via the Magic Proxy), so that fixup could not be
 *     ported. If video segments from `nonprofit.asia` / `cdnN.nonprofit.*` fail
 *     to play, this is why.
 */
(function () {
    const API_BASE = "https://anime47.love/api";
    const REFERER = `${manifest.baseUrl}/`;

    // Fill these in manually if the site starts requiring a login (PRIVATE_MODE).
    // SECURITY: never hard-code real credentials here — this file is public.
    // Leave blank unless the site actually requires an account.
    const ANIME47_EMAIL = "sumaymanlon@gmail.com";
    const ANIME47_PASSWORD = "Kobe1234@";

    let cachedToken = null;

    const SUBTITLE_LANGUAGE_MAP = {
        "Vietnamese": ["tiếng việt", "vietnamese", "vietsub", "viet", "vi"],
        "English": ["tiếng anh", "english", "engsub", "eng", "en"]
    };

    const MAIN_CATEGORIES = [
        // "Trending" is a reserved category name in SkyStream: it becomes the
        // hero carousel, mirroring the first row ("latest") from the original.
        { path: "/anime/filter?lang=vi&sort=latest", name: "Trending" },
        { path: "/anime/filter?lang=vi&sort=rating", name: "Top Đánh Giá" },
        { path: "/anime/filter?lang=vi&type=tv", name: "Anime TV" },
        { path: "/anime/filter?lang=vi&type=movie", name: "Anime Movie" }
    ];

    // ===================== Helpers =====================

    function fixUrl(url) {
        if (!url) return null;
        if (url.toLowerCase().includes("via.placeholder.com")) return null;
        if (/^http/i.test(url)) return url;
        if (url.startsWith("//")) return "https:" + url;
        const path = url.startsWith("/") ? url : "/" + url;
        return manifest.baseUrl.startsWith("http")
            ? manifest.baseUrl + path
            : "https:" + manifest.baseUrl + path;
    }

    function mapSubtitleLabel(label) {
        const trimmed = (label || "").trim();
        const lower = trimmed.toLowerCase();
        if (!lower) return "Subtitle";
        for (const standard in SUBTITLE_LANGUAGE_MAP) {
            if (SUBTITLE_LANGUAGE_MAP[standard].some((k) => lower.includes(k))) {
                return standard;
            }
        }
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }

    // The original Kotlin plugin showed the episode count on every card via
    // addDubStatus(DubStatus.Subbed, episodes). MultimediaItem has no direct
    // "episode count" field, so we fold it into the title (e.g. "Title [12 tập]")
    // to avoid silently dropping that information.
    function episodeCountSuffix(episodesStr) {
        if (!episodesStr) return "";
        const digitsOnly = String(episodesStr).replace(/\D/g, "");
        const n = digitsOnly ? parseInt(digitsOnly, 10) : NaN;
        return Number.isFinite(n) && n > 0 ? ` [${n} tập]` : "";
    }

    function toItem(post) {
        const link = fixUrl(post.link);
        if (!link) return null;
        const epSuffix = episodeCountSuffix(post.current_episode || post.episodes);
        return new MultimediaItem({
            title: (post.title || "") + epSuffix,
            url: link,
            posterUrl: fixUrl(post.poster || post.image) || "",
            // SkyStream has no separate "cartoon" type. The original always used
            // TvType.Anime (never Movie/OVA) so multi-episode "movies" always show
            // their full episode list; we keep that same behavior here.
            type: "anime",
            year: post.year ? parseInt(post.year, 10) || undefined : undefined
        });
    }

    // This runtime does not expose `fetch`; only http_get / http_post / http_parallel
    // are available (confirmed via runtime probing). http_get supports:
    //   await http_get(url, headers) -> { code, statusCode, status, body, headers, finalUrl }
    let lastLoginError = null;

    async function ensureToken() {
        if (cachedToken) return cachedToken;
        if (!ANIME47_EMAIL || !ANIME47_PASSWORD) {
            lastLoginError = "no_credentials";
            return null;
        }
        try {
            const res = await http_post(
                `${API_BASE}/auth/login`,
                JSON.stringify({ login: ANIME47_EMAIL, password: ANIME47_PASSWORD }),
                {
                    "Content-Type": "application/json",
                    "origin": manifest.baseUrl,
                    "referer": REFERER
                }
            );
            const status = res && (res.statusCode || res.status || res.code);
            const bodyText = res && (res.body !== undefined ? res.body : res.text);
            const bodyStr = typeof bodyText === "string" ? bodyText : JSON.stringify(bodyText);

            if (typeof status === "number" && (status < 200 || status >= 300)) {
                lastLoginError = `login HTTP ${status} :: ${bodyStr.slice(0, 150)}`;
                return null;
            }

            const json = typeof bodyText === "string" ? JSON.parse(bodyText) : bodyText;
            cachedToken = (json && json.access_token) || null;
            if (!cachedToken) {
                lastLoginError = `login response had no access_token :: ${bodyStr.slice(0, 150)}`;
            } else {
                lastLoginError = null;
            }
            return cachedToken;
        } catch (e) {
            lastLoginError = `login threw: ${e && e.message ? e.message : String(e)}`;
            return null;
        }
    }

    async function fetchApi(url) {
        const token = await ensureToken();
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const res = await http_get(url, headers);
        const status = res && (res.statusCode || res.status || res.code);
        const text = res && (res.body !== undefined ? res.body : res.text);
        const textStr = typeof text === "string" ? text : JSON.stringify(text);

        if (textStr.includes('"PRIVATE_MODE"') || status === 401) {
            const reason = lastLoginError
                ? ` (Chi tiết: ${lastLoginError})`
                : "";
            throw new Error(
                `Trang web yêu cầu đăng nhập. Vui lòng điền ANIME47_EMAIL / ANIME47_PASSWORD trong plugin.js.${reason}`
            );
        }
        if (typeof status === "number" && (status < 200 || status >= 300)) {
            throw new Error(`HTTP ${status} for ${url} :: ${textStr.slice(0, 150)}`);
        }
        if (typeof text === "object" && text !== null) {
            // Some runtimes may already hand back parsed JSON in `body`.
            return text;
        }
        try {
            return JSON.parse(textStr);
        } catch (e) {
            throw new Error(`JSON parse failed for ${url} :: ${textStr.slice(0, 150)}`);
        }
    }

    function extractAnimeId(url) {
        // Matches the original Kotlin: Regex("(\\d+)(?:\\.html|/)?$")
        const match = url.replace(/\/$/, "").match(/(\d+)(?:\.html|\/)?$/);
        return match ? match[1] : null;
    }

    // ===================== Core functions =====================

    async function getHome(cb) {
        try {
            const data = {};
            const errors = [];
            await Promise.all(
                MAIN_CATEGORIES.map(async (cat) => {
                    try {
                        const json = await fetchApi(`${API_BASE}${cat.path}&page=1`);
                        const posts = (json && json.data && json.data.posts) || [];
                        data[cat.name] = posts.map(toItem).filter(Boolean);
                    } catch (e) {
                        errors.push(`${cat.name}: ${e && e.message ? e.message : String(e)}`);
                        data[cat.name] = [];
                    }
                })
            );
            // If every category failed, surface a real error instead of silently
            // returning an empty dashboard.
            if (errors.length === MAIN_CATEGORIES.length) {
                return cb({ success: false, errorCode: "UNKNOWN", message: errors.join(" | ") });
            }
            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "UNKNOWN", message: String(e) });
        }
    }

    async function search(query, cb) {
        try {
            const url = `${API_BASE}/search/full/?lang=vi&keyword=${encodeURIComponent(query)}&page=1`;
            const json = await fetchApi(url);
            const results = ((json && json.results) || [])
                .map((item) => {
                    const link = fixUrl(item.link);
                    if (!link) return null;
                    const epSuffix = episodeCountSuffix(item.current_episode || item.episodes);
                    return new MultimediaItem({
                        title: (item.title || "") + epSuffix,
                        url: link,
                        posterUrl: fixUrl(item.image) || "",
                        type: "anime"
                    });
                })
                .filter(Boolean);
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "UNKNOWN", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const animeId = extractAnimeId(url);
            if (!animeId) {
                return cb({ success: false, errorCode: "NOT_FOUND", message: "Invalid anime ID from URL" });
            }

            const [infoRes, episodesRes, recsRes] = await Promise.all([
                fetchApi(`${API_BASE}/anime/info/${animeId}?lang=vi`),
                fetchApi(`${API_BASE}/anime/${animeId}/episodes?lang=vi`),
                fetchApi(`${API_BASE}/anime/info/${animeId}/recommendations?lang=vi`)
            ]);

            const detail = infoRes && infoRes.data;
            if (!detail) throw new Error("Data is null");

            const episodeItems = ((episodesRes && episodesRes.teams) || [])
                .flatMap((t) => t.groups || [])
                .flatMap((g) => g.episodes || [])
                .filter((e) => e.number != null);

            const byNumber = {};
            episodeItems.forEach((e) => {
                if (!byNumber[e.number]) byNumber[e.number] = [];
                if (!byNumber[e.number].includes(e.id)) byNumber[e.number].push(e.id);
            });

            const episodes = Object.keys(byNumber)
                .map(Number)
                .sort((a, b) => a - b)
                .map(
                    (number) =>
                        new Episode({
                            name: `Tập ${number}`,
                            // Data is passed straight through to loadStreams, exactly like
                            // the original packed the episode-id list into ExtractorLink data.
                            url: JSON.stringify(byNumber[number]),
                            season: 1,
                            episode: number,
                            dubStatus: "sub"
                        })
                );

            const recommendations = ((recsRes && recsRes.data) || [])
                .map((item) => {
                    const link = fixUrl(item.link);
                    if (!link) return null;
                    const epSuffix = episodeCountSuffix(item.current_episode || item.episodes);
                    return new MultimediaItem({
                        title: (item.title || "") + epSuffix,
                        url: link,
                        posterUrl: fixUrl(item.poster) || "",
                        type: "anime",
                        year: item.year ? parseInt(item.year, 10) || undefined : undefined
                    });
                })
                .filter(Boolean);

            const item = new MultimediaItem({
                title: detail.title || "Unknown Title",
                url: url,
                posterUrl: fixUrl(detail.poster) || "",
                type: "anime",
                year: detail.year ? parseInt(detail.year, 10) || undefined : undefined,
                score: typeof detail.score === "number" ? detail.score : undefined,
                description: detail.description || "",
                tags: (detail.genres || []).map((g) => g.name).filter(Boolean),
                cast: (detail.characters || [])
                    .filter((c) => c.name)
                    .map((c) => new Actor({ name: c.name, role: c.role, image: fixUrl(c.image_url) })),
                recommendations,
                episodes
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "UNKNOWN", message: String(e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            let episodeIds;
            if (url.startsWith("[")) {
                episodeIds = JSON.parse(url);
            } else {
                episodeIds = [parseInt(url, 10)];
            }
            if (!episodeIds || !episodeIds.length) return cb({ success: true, data: [] });

            const results = [];
            await Promise.all(
                episodeIds.map(async (id) => {
                    try {
                        const watch = await fetchApi(`${API_BASE}/anime/watch/episode/${id}?lang=vi`);
                        const streams = (watch && watch.streams) || [];
                        for (const stream of streams) {
                            if (!stream.url) continue;

                            const headers = {
                                "Referer": REFERER,
                                "User-Agent":
                                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                                "sec-ch-ua": '"Chromium";v="120", "Not?A_Brand";v="24"',
                                "sec-ch-ua-mobile": "?1",
                                "sec-ch-ua-platform": '"Android"'
                            };

                            if (stream.url.includes("vlogphim.net")) {
                                headers["Origin"] = REFERER;
                                try {
                                    headers["authority"] = new URL(stream.url).host;
                                } catch (e) {
                                    headers["authority"] = "pl.vlogphim.net";
                                }
                            }

                            const subtitles = (stream.subtitles || [])
                                .filter((s) => s.file)
                                .map((s) => {
                                    const label = mapSubtitleLabel(s.label || "Vietnamese");
                                    return { url: s.file, label, lang: label };
                                });

                            results.push(
                                new StreamResult({
                                    url: stream.url,
                                    source: stream.server_name || "Anime47",
                                    headers,
                                    subtitles
                                })
                            );
                        }
                    } catch (e) {
                        // Skip individual episode failures, same as the original's per-id try/catch.
                    }
                })
            );

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "UNKNOWN", message: String(e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
