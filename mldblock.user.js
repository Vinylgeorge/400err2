// ==UserScript==
// @name         🛑 Block MLDataLabeler $0.20 Task (AB2soft)
// @namespace    ab2soft.block
// @version      1.0
// @description  Automatically hide or auto-return MLDataLabeler 0.20 Data Labeling HITs on MTurk
// @author       AB2soft
// @match        https://worker.mturk.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // === SETTINGS ===
  const BLOCKED_REQUESTER = "MLDataLabeler";
  const BLOCKED_TITLE = "Data labeling: European Mexican Spanish Female Adult";
  const BLOCKED_REWARD = "$0.20";

  // Hide HIT rows in search results / queue
  function hideBlockedHits() {
    document.querySelectorAll("tr.table-row, li[data-reactid], div[data-react-class]").forEach(el => {
      const txt = el.innerText || "";
      if (txt.includes(BLOCKED_REQUESTER) &&
          txt.includes(BLOCKED_TITLE) &&
          txt.includes(BLOCKED_REWARD)) {
        el.style.display = "none";
        el.style.background = "#ffe6e6"; // light red background
        console.log("🚫 Blocked MLDataLabeler $0.20 HIT hidden.");
      }
    });
  }

  // Auto-return if opened directly
  function autoReturnBlockedHit() {
    const bodyText = document.body.innerText || "";
    if (bodyText.includes(BLOCKED_REQUESTER) &&
        bodyText.includes(BLOCKED_TITLE) &&
        bodyText.includes(BLOCKED_REWARD)) {
      console.warn("🛑 Auto-returning blocked MLDataLabeler $0.20 HIT...");
      const btn = [...document.querySelectorAll("button, input[type=submit]")]
        .find(b => /return/i.test(b.textContent || b.value));
      if (btn) btn.click();
    }
  }

  // Run continuously to catch new HITs as page updates
  const observer = new MutationObserver(hideBlockedHits);
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run
  hideBlockedHits();
  autoReturnBlockedHit();

})();
