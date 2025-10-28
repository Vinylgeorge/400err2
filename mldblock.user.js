// ==UserScript==
// @name         🛑 Block MLDataLabeler - Multi Project Auto Block
// @namespace    ab2soft.block
// @version      2.0
// @description  Automatically hide or auto-return MLDataLabeler HITs from multiple blocked project URLs
// @author       AB2soft
// @match        https://worker.mturk.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // === 🧱 LIST OF BLOCKED PROJECT IDS ===
  const BLOCKED_PROJECTS = [
    "3QYV7EF3Q76O47X7VQSRUYM26GOLKK", // Data labeling: European Mexican Spanish
    "3M35MA94JZXXH21MMQIOJ7HR2SAONX",  // Example future MLDataLabeler task
    "3HYV4299H1KPY0N2NAXAGGZEY0HE8X"  // Another clone project (optional)
  ];

  // === 🧩 Hide blocked HITs from search/queue results ===
  function hideBlockedHits() {
    document.querySelectorAll("a[href*='/projects/']").forEach(link => {
      for (const projectId of BLOCKED_PROJECTS) {
        if (link.href.includes(projectId)) {
          const row = link.closest("tr, li, div");
          if (row && row.style.display !== "none") {
            row.style.display = "none";
            row.style.background = "#ffe6e6";
            console.log(`🚫 Blocked and hidden HIT from project ${projectId}`);
          }
        }
      }
    });
  }

  // === 🧠 Auto-return if a blocked HIT page is opened ===
  function autoReturnBlockedHit() {
    for (const projectId of BLOCKED_PROJECTS) {
      if (window.location.href.includes(projectId)) {
        console.warn(`🛑 Auto-returning HIT from blocked project ${projectId}`);
        const btn = [...document.querySelectorAll("button, input[type=submit]")]
          .find(b => /return/i.test(b.textContent || b.value));
        if (btn) {
          btn.click();
          console.log(`↩️ Returned HIT from ${projectId}`);
        }
      }
    }
  }

  // === 🕵️‍♂️ Observe dynamic page updates (React/SPA) ===
  const observer = new MutationObserver(hideBlockedHits);
  observer.observe(document.body, { childList: true, subtree: true });

  // === 🔁 Run immediately at load ===
  hideBlockedHits();
  autoReturnBlockedHit();
})();
