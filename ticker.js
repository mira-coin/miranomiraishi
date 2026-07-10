(function () {
  function init() {
    if (document.getElementById("news-ticker")) return;
    var css = document.createElement("style");
    css.textContent =
      '@keyframes mvTicker{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}' +
      '#news-ticker{position:sticky;top:0;left:0;width:100%;z-index:99999;background:linear-gradient(90deg,#07070f,#12123a 50%,#07070f);border-bottom:1px solid rgba(150,180,255,.32);overflow:hidden;height:40px;display:flex;align-items:center;box-shadow:0 4px 18px rgba(0,0,0,.45)}' +
      '#news-ticker .nt-tag{flex:0 0 auto;background:linear-gradient(90deg,#8fe6ff,#c9a8ff);color:#04121a;font-weight:800;font-size:12px;letter-spacing:.16em;padding:0 16px;height:100%;display:flex;align-items:center}' +
      '#news-ticker .nt-track{flex:1;overflow:hidden;white-space:nowrap}' +
      '#news-ticker .nt-run{display:inline-block;padding-left:100%;animation:mvTicker 38s linear infinite;color:#e6edff;font-size:13.5px;font-weight:600;letter-spacing:.02em}' +
      '#news-ticker .nt-run:hover{animation-play-state:paused}' +
      '#news-ticker b{color:#7fe3ff;font-size:16px;font-weight:800;text-shadow:0 0 10px rgba(120,200,255,.65)}';
    document.head.appendChild(css);
    var bar = document.createElement("div");
    bar.id = "news-ticker";
    bar.innerHTML =
      '<span class="nt-tag">NEWS</span>' +
      '<div class="nt-track"><span class="nt-run">' +
      '2025年 ミラの未来視 SNSデビュー ― <b>累計300万PV突破</b>' +
      ' ／ 漫画 Amazon Kindle ベストセラー受賞・超有名日本漫画を上回るランキング入り経験' +
      ' ／ ウェブサイト各部門で漫画1位獲得' +
      ' ／ 音楽MV・動画も TikTok でバズ動画多数' +
      ' ／ 快進撃中 ― 今、世界でも最も勢いある個人プロジェクト！' +
      ' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    // remove the now-unused "Admin" nav entry (editor was deleted)
    try {
      [].slice.call(document.querySelectorAll('a,button')).forEach(function (el) {
        var href = (el.getAttribute && (el.getAttribute("href") || "")) || "";
        var txt = (el.textContent || "").trim().toLowerCase();
        if (el.closest && el.closest("#news-ticker")) return;
        if (/(^|\/)admin(\.html|\/|$)/i.test(href) || txt === "admin") el.remove();
      });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
