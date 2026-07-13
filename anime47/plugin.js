/**
 * TEMP DIAGNOSTIC PLUGIN #3 — not for production use.
 * Purpose: figure out the real calling convention of http_post() in this
 * runtime. http_get(url, headers) is already confirmed working; http_post
 * returned "HTTP 0" which means the call itself is malformed (not a real
 * server response). Delete after diagnosis.
 */
(function () {
    const TEST_URL = "https://httpbin.org/post";
    const TEST_BODY = JSON.stringify({ hello: "world" });
    const TEST_HEADERS = { "Content-Type": "application/json" };

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

    async function withTimeout(promiseFactory, ms) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error("timeout after " + ms + "ms"));
                }
            }, ms);
            try {
                promiseFactory()
                    .then((v) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        resolve(v);
                    })
                    .catch((e) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        reject(e);
                    });
            } catch (syncErr) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    reject(syncErr);
                }
            }
        });
    }

    async function getHome(cb) {
        const results = [];

        // A: await http_post(url, body, headers)
        try {
            const r = await withTimeout(() => http_post(TEST_URL, TEST_BODY, TEST_HEADERS), 6000);
            results.push("A:http_post(url,body,headers) OK -> " + describe(r));
        } catch (e) {
            results.push("A:http_post(url,body,headers) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // B: await http_post(url, headers, body)
        try {
            const r = await withTimeout(() => http_post(TEST_URL, TEST_HEADERS, TEST_BODY), 6000);
            results.push("B:http_post(url,headers,body) OK -> " + describe(r));
        } catch (e) {
            results.push("B:http_post(url,headers,body) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // C: await http_post(url, {body, headers})
        try {
            const r = await withTimeout(
                () => http_post(TEST_URL, { body: TEST_BODY, headers: TEST_HEADERS }),
                6000
            );
            results.push("C:http_post(url,{body,headers}) OK -> " + describe(r));
        } catch (e) {
            results.push("C:http_post(url,{body,headers}) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // D: await http_post({url, body, headers})
        try {
            const r = await withTimeout(
                () => http_post({ url: TEST_URL, body: TEST_BODY, headers: TEST_HEADERS }),
                6000
            );
            results.push("D:http_post({url,body,headers}) OK -> " + describe(r));
        } catch (e) {
            results.push("D:http_post({url,body,headers}) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

        // E: await http_post(url, body) -- no headers arg at all
        try {
            const r = await withTimeout(() => http_post(TEST_URL, TEST_BODY), 6000);
            results.push("E:http_post(url,body) OK -> " + describe(r));
        } catch (e) {
            results.push("E:http_post(url,body) FAIL -> " + (e && e.message ? e.message : String(e)));
        }

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
