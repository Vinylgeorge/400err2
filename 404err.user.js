// ==UserScript==
// @name         MTurk Global Cookie Auto-Cleaner (Safe)
// @namespace    ab2soft.mturk.cleaner
// @version      2.0
// @description  Auto-delete only oversized cookies on ALL MTurk domains without breaking login sessions.
// @match        *://*.mturk.com/*
// @match        *://mturk.com/*
// @match        *://*.mturkcontent.com/*
// @match        *://mturkcontent.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Session cookies that must NOT be deleted
    const PROTECTED = [
        "session-token",
        "at-main",
        "sess-at-main",
        "ubid-main",
        "x-main",
        "aws-userInfo"
    ];

    function isProtected(name) {
        return PROTECTED.some(p => name.startsWith(p));
    }

    function cleanCookies() {
        const cookies = document.cookie.split(";");

        cookies.forEach(raw => {
            const cookie = raw.trim();
            const name = cookie.split("=")[0];

            // Skip protected cookies (login/session)
            if (isProtected(name)) return;

            // Delete if cookie is too big
            if (cookie.length > 350) {
                document.cookie =
                    name + "=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                console.log("🧹 Deleted oversized MTurk cookie:", name, "size:", cookie.length);
            }
        });
    }

    // Clean every 10 seconds
    setInterval(cleanCookies, 10000);

    // Clean immediately on page load
    cleanCookies();

    console.log("✅ MTurk Global Cookie Auto-Cleaner Loaded");
})();
