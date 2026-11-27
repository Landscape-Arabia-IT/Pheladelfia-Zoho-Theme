/* Presentation behavior only. Product, cart and checkout state stays with Zoho. */
(function () {
  function start() {
    var siteHeader = document.querySelector(".ph-header");
    function syncHeader() {
      if (!siteHeader) return;
      var home = document.body.classList.contains("is-home");
      var stuck = window.scrollY > 12;
      var menuOpen = document.body.classList.contains("ph-nav-open");
      siteHeader.classList.toggle("is-stuck", stuck);
      siteHeader.classList.toggle("is-solid", !home || stuck || menuOpen);
      document.documentElement.style.setProperty(
        "--ph-header-offset",
        siteHeader.offsetHeight + "px",
      );
    }
    if (siteHeader) {
      syncHeader();
      window.addEventListener("scroll", syncHeader, { passive: true });
      window.addEventListener("resize", syncHeader);
      siteHeader.addEventListener("mouseover", syncHeader);
      siteHeader.addEventListener("mouseout", syncHeader);
      siteHeader.addEventListener("focusin", syncHeader);
      siteHeader.addEventListener("focusout", function () {
        window.setTimeout(syncHeader, 0);
      });
      if (window.MutationObserver)
        new MutationObserver(syncHeader).observe(document.body, {
          attributes: true,
          attributeFilter: ["class"],
        });
    }
    var searchToggle = document.querySelector("[data-ph-search-toggle]");
    var header = document.querySelector(".ph-header-top");
    function closeSearch() {
      header?.classList.remove("is-search-open");
      searchToggle?.setAttribute("aria-expanded", "false");
    }
    searchToggle?.addEventListener("click", function () {
      var open = header.classList.toggle("is-search-open");
      searchToggle.setAttribute("aria-expanded", String(open));
      if (open) header.querySelector("input[type=search]")?.focus();
    });
    document.addEventListener("keydown", function (event) {
      if (
        event.key === "Escape" &&
        header?.classList.contains("is-search-open")
      ) {
        closeSearch();
        searchToggle.focus();
      }
    });
    document.addEventListener("click", function (event) {
      if (header && !header.contains(event.target)) closeSearch();
    });
    var catalog = document.querySelector(".ph-catalog");
    var panel = document.querySelector("#ph-catalog-filters");
    var toggle = document.querySelector("[data-ph-filter-toggle]");
    var mobile = window.matchMedia("(max-width:980px)");
    function closeFilters(restore) {
      catalog?.classList.remove("is-filter-open");
      document.body.classList.remove("ph-filter-open");
      panel?.removeAttribute("role");
      panel?.removeAttribute("aria-modal");
      toggle?.setAttribute(
        "aria-expanded",
        String(
          !mobile.matches &&
            !catalog?.classList.contains("is-filter-collapsed"),
        ),
      );
      if (restore) toggle?.focus();
    }
    toggle?.addEventListener("click", function () {
      if (!mobile.matches) {
        collapsed = catalog.classList.toggle("is-filter-collapsed");
        toggle.setAttribute("aria-expanded", String(!collapsed));
        return;
      }
      if (catalog.classList.contains("is-filter-open")) {
        closeFilters(true);
        return;
      }
      catalog.classList.add("is-filter-open");
      document.body.classList.add("ph-filter-open");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute(
        "aria-label",
        document.documentElement.lang === "ar" ? "الفلاتر" : "Filters",
      );
      toggle.setAttribute("aria-expanded", "true");
      panel.querySelector("[data-ph-filter-close]")?.focus();
    });
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-ph-filter-close]")) closeFilters(true);
      if (
        catalog?.classList.contains("is-filter-open") &&
        !panel.contains(event.target) &&
        !toggle.contains(event.target)
      )
        closeFilters(true);
    });
    document.addEventListener("keydown", function (event) {
      if (!catalog?.classList.contains("is-filter-open")) return;
      if (event.key === "Escape") {
        closeFilters(true);
        return;
      }
      if (event.key !== "Tab") return;
      var nodes = Array.from(
        panel.querySelectorAll("a[href],button,input,select,summary"),
      ).filter(function (el) {
        return !el.disabled && el.getClientRects().length;
      });
      var first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    mobile.addEventListener("change", function () {
      closeFilters(false);
    });
    closeFilters(false);
    // Keep keyboard focus in a mobile facet dialog after Zoho refreshes it.
    document.addEventListener("ph-catalog-updated", function () {
      if (catalog?.classList.contains("has-no-filters")) {
        closeFilters(false);
        return;
      }
      if (
        catalog?.classList.contains("is-filter-open") &&
        document.activeElement === document.body
      )
        panel.querySelector("[data-ph-filter-close]")?.focus();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
