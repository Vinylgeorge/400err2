// ==UserScript==
// @name         🛑 Block MLDataLabeler - Data labeling: European Mexican Spanish
// @namespace    ab2soft.block
// @version      1.1
// @description  Hide or auto-return all HITs from MLDataLabeler with title containing "Data labeling: European Mexican Spanish"
// @author       AB2soft
// @match        https://worker.mturk.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const BLOCKED_REQUESTER = "MLDataLabeler";
  const TITLE_KEYWORD = "Data labeling: European Mexican Spanish";

  // Hide matching HITs in search/queue pages
  function hideBlockedHits() {
    document.querySelectorAll("tr.table-row, li[data-reactid], div[data-react-class]").forEach(el => {
      const text = el.innerText || "";
      if (text.includes(BLOCKED_REQUESTER) && text.includes(TITLE_KEYWORD)) {
        el.style.display = "none";
        el.style.background = "#ffe6e6";
        console.log("🚫 Blocked MLDataLabeler - Data labeling: European Mexican Spanish HIT hidden.");
      }
    });
  }

  // Auto-return if opened directly
  function autoReturnBlockedHit() {
    const bodyText = document.body.innerText || "";
    if (bodyText.includes(BLOCKED_REQUESTER) && bodyText.includes(TITLE_KEYWORD)) {
      console.warn("🛑 Auto-returning MLDataLabeler - Data labeling: European Mexican Spanish HIT...");
      const btn = [...document.querySelectorAll("button, input[type=submit]")]
        .find(b => /return/i.test(b.textContent || b.value));
      if (btn) btn.click();
    }
  }

  // Watch for dynamically loaded pages
  const observer = new MutationObserver(hideBlockedHits);
  observer.observe(document.body, { childList: true, subtree: true });

  // Run immediately
  hideBlockedHits();
  autoReturnBlockedHit();
})();
