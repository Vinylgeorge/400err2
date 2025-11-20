// ==UserScript==
// @name         MTurk Cookie Auto-Cleaner (Safe)
// @namespace    ab2soft.cleaner
// @version      1.0
// @description  Auto-delete only oversized cookies on MTurk to prevent 400 Bad Request errors without breaking login.
// @match        https://worker.mturk.com/*
// @match        https://www.mturk.com/*
// @match        https://www.mturkcontent.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Cookies that MUST NOT be deleted (login/session)
    const PROTECT = [
        "session-token",
        "sess-at-main",
        "at-main",
        "ubid-main",
        "x-main",
        "x-main-",
        "aws-userInfo",
    ];

    function isProtected(name) {
        return PROTECT.some(p => name.startsWith(p));
    }

    function cleanCookies() {
        const cookies = document.cookie.split(";");

        cookies.forEach(cookie => {
            const trimmed = cookie.trim();
            const name = trimmed.split("=")[0];

            // Skip protected cookies
            if (isProtected(name)) return;

            // Delete only cookies larger than 300 characters
            if (trimmed.length > 300) {
                document.cookie = `${name}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
                console.log("🧹 Deleted oversized cookie:", name, "(size:", trimmed.length, ")");
            }
        });
    }

    // Run every 15 seconds
    setInterval(cleanCookies, 15000);

    // Run immediately on page load
    cleanCookies();

    console.log("✅ MTurk Safe Cookie Cleaner Loaded");
})();
