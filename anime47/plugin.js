/**
 * TEMP DIAGNOSTIC PLUGIN — not for production use.
 * Purpose: report which network-related globals actually exist in this
 * SkyStream runtime, so we know what to build fetchApi() on top of.
 * Delete this file / do not deploy it long-term.
 */
(function () {
    async function getHome(cb) {
        const checks = [
            "fetch",
            "http_get",
            "http_post",
            "http_parallel",
            "XMLHttpRequest",
            "manifest",
            "MultimediaItem",
            "Episode",
            "StreamResult",
            "Actor"
        ];

        const report = checks
            .map((name) => {
                let present;
                try {
                    // eslint-disable-next-line no-eval
                    present = typeof eval(name) !== "undefined";
                } catch (e) {
                    present = false;
                }
                return `${name}=${present}`;
            })
            .join(", ");

        cb({ success: false, errorCode: "UNKNOWN", message: "GLOBALS: " + report });
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
