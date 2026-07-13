/**
 * TEMP DIAGNOSTIC PLUGIN #2 — not for production use.
 * Purpose: figure out the real calling convention of http_get() in this
 * runtime (callback-style vs Promise-style vs object-arg), plus inspect
 * the shape of `manifest`. Delete after diagnosis.
 */
(function () {
    const TEST_URL = "https://httpbin.org/get";

    function describe(value) {
        try {
            if (value === undefined) return "undefined";
            if (value === null) return "null";
            const t = typeof value;
            if (t === "function") return "function";
            if (t === "object") {
                const keys = Object.keys(value).slice(0, 10);
                return "object{" + keys.join(",") + "}";
            }
            return t + ":" + String(value).slice(0, 80);
        } catch (e) {
            return "describe-failed:" + String(e);
        }
    }

    async function getHome(cb) {
        const results = [];

        // Attempt A: http_get(url, callback(err, res))
        try {
            const r = await new Promise((resolve, reject) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        reject(new Error("timeout after 6s"));
                    }
                }, 6000);
                try {
                    http_get(TEST_URL, (err, res) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        if (err) reject(err);
                        else resolve(res);
                    });
                } catch (syncErr) {
                    clearTimeout(timer);
                    if (!settled) {
                        settled = true;
                        reject(syncErr);
                    }
                }
            });
            results.push("A:http_get(url,cb(err,res)) OK -> " + describe(r));
        } catch (e) {
            results.push("A:http_get(url,cb(err,res)) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // Attempt B: http_get(url, headers, callback(res))
        try {
            const r = await new Promise((resolve, reject) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        reject(new Error("timeout after 6s"));
                    }
                }, 6000);
                try {
                    http_get(TEST_URL, {}, (res) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        resolve(res);
                    });
                } catch (syncErr) {
                    clearTimeout(timer);
                    if (!settled) {
                        settled = true;
                        reject(syncErr);
                    }
                }
            });
            results.push("B:http_get(url,headers,cb(res)) OK -> " + describe(r));
        } catch (e) {
            results.push("B:http_get(url,headers,cb(res)) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // Attempt C: await http_get(url) directly (Promise-based)
        try {
            const r = await http_get(TEST_URL);
            results.push("C:await http_get(url) OK -> " + describe(r));
        } catch (e) {
            results.push("C:await http_get(url) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // Attempt D: await http_get({url, headers})
        try {
            const r = await http_get({ url: TEST_URL, headers: {} });
            results.push("D:await http_get({url,headers}) OK -> " + describe(r));
        } catch (e) {
            results.push("D:await http_get({url,headers}) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // Attempt E: http_parallel([{url}])
        try {
            const r = await http_parallel([{ url: TEST_URL }]);
            results.push("E:await http_parallel([{url}]) OK -> " + describe(r));
        } catch (e) {
            results.push("E:await http_parallel([{url}]) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        results.push("manifest -> " + describe(typeof manifest !== "undefined" ? manifest : undefined));

        cb({ success: false, errorCode: "UNKNOWN", message: results.join(" || ") });
    }

    async function search(query, cb) {
        cb({ success: true, data: [] });
    }

    async function load(url, cb) {
        cb({ success: false, errorCode: "NOT_FOUND", message: "probe plugin, not implemented" });
    }

    async function loadStreams(url, cb) {
        cb({ success: true, data: [] });
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
