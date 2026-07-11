(function () {
  "use strict";
  var LANGS = [
    { c: "ja", n: "日本語" }, { c: "en", n: "English" }, { c: "id", n: "Indonesia" },
    { c: "es", n: "Español" }, { c: "zh", n: "中文" }, { c: "ko", n: "한국어" }
  ];
  var IDX = { en: 0, id: 1, es: 2, zh: 3, ko: 4 }; // ja is the source key

  // T[japanese] = [en, id, es, zh, ko]
  var T = {
    // ---- ticker ----
    "2025年 ミラの未来視 SNSデビュー ― 累計300万PV突破 ／ 漫画 Amazon Kindle ベストセラー受賞・超有名日本漫画を上回るランキング入り経験 ／ ウェブサイト各部門で漫画1位獲得 ／ 音楽MV・動画も TikTok でバズ動画多数 ／ 快進撃中 ― 今、世界でも最も勢いある個人プロジェクト！":
      ["2025: Mira Vision debuts on social media ― over 3,000,000 total views / Amazon Kindle bestseller, ranked above world-famous manga / #1 manga in every website category / viral hits on TikTok too / on a roll ― the most unstoppable indie project in the world right now!",
       "2025: Mira Vision debut di media sosial ― lebih dari 3.000.000 total tayangan / Bestseller Amazon Kindle, peringkat di atas manga terkenal dunia / manga #1 di semua kategori situs / banyak video viral di TikTok / terus melaju ― proyek indie paling berkembang di dunia saat ini!",
       "2025: Mira Vision debuta en redes sociales ― más de 3.000.000 de visitas / bestseller en Amazon Kindle, por encima de manga mundialmente famoso / manga n.º1 en todas las categorías web / éxitos virales también en TikTok / imparable ― ¡el proyecto indie con más impulso del mundo ahora mismo!",
       "2025年 米拉未来视 社交媒体出道 ― 累计观看突破300万 / Amazon Kindle畅销书，排名超越世界知名漫画 / 网站各类别漫画第1名 / 音乐MV与视频在TikTok多次爆红 / 势不可挡 ― 当今世界最具气势的个人项目！",
       "2025년 미라의 미래시 SNS 데뷔 ― 누적 300만 뷰 돌파 / Amazon Kindle 베스트셀러, 초유명 일본 만화를 능가하는 랭킹 경험 / 웹사이트 각 부문 만화 1위 / 음악 MV·영상도 TikTok에서 다수 화제 / 파죽지세 ― 지금 세계에서 가장 기세 있는 개인 프로젝트!"],
    // ---- hero / site ----
    "漫画、アニメ、ゲーム、音楽、グッズ、そして2DライブAIアイドルルームまで。個人制作の熱量を、世界に向けて企業サイト級の信頼感で届けるための公式拠点です。":
      ["Manga, anime, games, music, goods, and even a 2D live AI idol room. The official hub delivering the passion of indie creation to the world with corporate-grade trust.",
       "Manga, anime, gim, musik, merch, hingga ruang idol AI live 2D. Hub resmi yang menyampaikan semangat karya indie ke dunia dengan kepercayaan setingkat situs korporat.",
       "Manga, anime, videojuegos, música, merch e incluso una sala de ídolo AI en vivo 2D. El hub oficial que lleva la pasión de la creación indie al mundo con confianza de nivel corporativo.",
       "漫画、动画、游戏、音乐、周边，乃至2D实时AI偶像房间。以企业级的信赖感，将个人创作的热情传递给全世界的官方枢纽。",
       "만화, 애니, 게임, 음악, 굿즈, 그리고 2D 라이브 AI 아이돌 룸까지. 개인 제작의 열정을 기업 사이트급 신뢰로 세계에 전하는 공식 허브입니다."],
    // ---- card titles ----
    "漫画無料公開エリア": ["Free Manga Area", "Area Manga Gratis", "Zona de Manga Gratis", "漫画免费公开区", "만화 무료 공개 구역"],
    "ミラのリズムゲーム体験版": ["Mira Rhythm Game (Demo)", "Gim Ritme Mira (Demo)", "Juego de Ritmo de Mira (Demo)", "米拉音乐节奏游戏体验版", "미라 리듬게임 체험판"],
    "ミラの未来視パズルゲーム": ["Mira Vision Puzzle Game", "Gim Puzzle Mira Vision", "Juego de Puzzle Mira Vision", "米拉未来视益智游戏", "미라의 미래시 퍼즐게임"],
    "ミラ無双 横スクロールアクション": ["Mira Musou Side-Scroll Action", "Aksi Side-Scroll Mira Musou", "Acción Lateral Mira Musou", "米拉无双 横版动作", "미라 무쌍 횡스크롤 액션"],
    "ミラのエンドレスウィルスバスター": ["Mira Endless Virus Buster", "Mira Endless Virus Buster", "Mira Endless Virus Buster", "米拉无尽病毒克星", "미라의 엔드리스 바이러스 버스터"],
    "ミラのアニメMV": ["Mira Anime MV", "MV Anime Mira", "MV Anime de Mira", "米拉动画MV", "미라 애니메이션 MV"],
    "配信音楽紹介": ["Streaming Music", "Musik Streaming", "Música en Streaming", "音乐流媒体介绍", "스트리밍 음악 소개"],
    "ミラのキャラクターグッズ": ["Mira Character Goods", "Merch Karakter Mira", "Merch de Personajes de Mira", "米拉角色周边", "미라 캐릭터 굿즈"],
    "世界観・キャラクター資料": ["World & Character Guide", "Panduan Dunia & Karakter", "Guía de Mundo y Personajes", "世界观・角色资料", "세계관·캐릭터 자료"],
    "AI Idol Room Lab": ["AI Idol Room Lab", "AI Idol Room Lab", "AI Idol Room Lab", "AI偶像房间实验室", "AI 아이돌 룸 랩"],
    "要望ボード": ["Request Board", "Papan Permintaan", "Buzón de Sugerencias", "意见反馈板", "요청 게시판"],
    // ---- card buttons ----
    "漫画を読む": ["Read Manga", "Baca Manga", "Leer Manga", "阅读漫画", "만화 읽기"],
    "体験版をプレイ": ["Play Demo", "Mainkan Demo", "Jugar Demo", "试玩体验版", "체험판 플레이"],
    "パズルを遊ぶ": ["Play Puzzle", "Main Puzzle", "Jugar Puzzle", "玩益智游戏", "퍼즐 플레이"],
    "アクションを遊ぶ": ["Play Action", "Main Aksi", "Jugar Acción", "玩动作游戏", "액션 플레이"],
    "STGを遊ぶ": ["Play Shooter", "Main STG", "Jugar Shooter", "玩射击游戏", "슈팅 플레이"],
    "YouTubeで見る": ["Watch on YouTube", "Tonton di YouTube", "Ver en YouTube", "在YouTube观看", "YouTube에서 보기"],
    "BOOTHで見る": ["View on BOOTH", "Lihat di BOOTH", "Ver en BOOTH", "在BOOTH查看", "BOOTH에서 보기"],
    "リンク準備中": ["Coming soon", "Segera hadir", "Próximamente", "链接准备中", "링크 준비 중"],
    "音源を開く": ["Open Audio", "Buka Audio", "Abrir Audio", "打开音源", "음원 열기"],
    "資料追加": ["More coming", "Segera hadir", "Próximamente", "资料补充中", "자료 추가 예정"],
    "Roomへ": ["Enter Room", "Ke Room", "Entrar", "进入房间", "룸으로"],
    "要望を送る": ["Send a Request", "Kirim Permintaan", "Enviar Sugerencia", "提交意见", "요청 보내기"],
    "準備中": ["Coming soon", "Segera hadir", "Próximamente", "准备中", "준비 중"],
    "公式サイト": ["Official Site", "Situs Resmi", "Sitio Oficial", "官方网站", "공식 사이트"],
    "公式URL": ["Official URL", "URL Resmi", "URL Oficial", "官方URL", "공식 URL"],
    // ---- card descriptions ----
    "アイマンガで公開中のミラの未来視。日本語・English対応の漫画ページへ移動できます。":
      ["Mira Vision, published on AI-Manga. Jump to the manga page (Japanese / English).", "Mira Vision, terbit di AI-Manga. Menuju halaman manga (Jepang / Inggris).", "Mira Vision, publicado en AI-Manga. Ir a la página del manga (japonés / inglés).", "在AI-Manga连载的米拉未来视。可前往支持日语・英语的漫画页面。", "AI-Manga에서 공개 중인 미라의 미래시. 일본어·영어 대응 만화 페이지로 이동합니다."],
    "ブラウザで遊べるミラのリズムゲーム体験版を公開中。今後のデモや更新版もここに追加していきます。":
      ["Play Mira's rhythm game demo right in your browser. Future demos and updates will be added here.", "Mainkan demo gim ritme Mira langsung di browser. Demo & pembaruan berikutnya ditambahkan di sini.", "Juega la demo del juego de ritmo de Mira en tu navegador. Aquí se añadirán futuras demos y updates.", "在浏览器即可畅玩米拉音乐节奏游戏体验版。今后的Demo与更新版也会陆续添加。", "브라우저에서 즐기는 미라 리듬게임 체험판. 앞으로의 데모·업데이트도 여기에 추가됩니다."],
    "公開中のブラウザ版パズルゲーム。ミラの未来視のゲーム作品として、外部Netlify版へリンクします。":
      ["A browser puzzle game, live now. Links to the external Netlify version.", "Gim puzzle berbasis browser yang sudah rilis. Tautan ke versi Netlify eksternal.", "Un juego de puzzle en navegador, ya disponible. Enlaza a la versión externa en Netlify.", "已公开的浏览器益智游戏。作为米拉未来视的游戏作品，链接至外部Netlify版本。", "공개 중인 브라우저 퍼즐게임. 외부 Netlify 버전으로 연결됩니다."],
    "動画スクショを素材化して作った、リズムゲームとは別の横スクロールアクション。ちびミラで敵をなぎ倒す完成版です。":
      ["A side-scrolling action game built from video screenshots—separate from the rhythm game. The finished version where chibi Mira mows down enemies.", "Gim aksi side-scroll dari tangkapan layar video—terpisah dari gim ritme. Versi final, chibi Mira menumbangkan musuh.", "Un juego de acción lateral hecho con capturas de vídeo, aparte del de ritmo. Versión final: la chibi Mira arrasa enemigos.", "以视频截图作为素材制作的横版动作游戏，与节奏游戏不同。Q版米拉横扫敌人的完成版。", "영상 스크린샷을 소재화해 만든 리듬게임과 별개의 횡스크롤 액션. 치비 미라로 적을 쓸어버리는 완성판입니다."],
    "ミラの横スクロールエンドレスSTG。1分ごとに強化ボスが出現し、3種ステージがランダム変化。ブラウザですぐ遊べます。":
      ["Mira's side-scrolling endless shooter. A tougher boss appears every minute and 3 stage types shuffle randomly. Play instantly in your browser.", "STG endless side-scroll Mira. Bos lebih kuat muncul tiap menit, 3 tipe stage berganti acak. Main langsung di browser.", "Shooter endless lateral de Mira. Cada minuto aparece un jefe más fuerte y 3 tipos de escenario cambian al azar. Juega al instante en tu navegador.", "米拉的横版无尽STG。每分钟出现强化Boss，3种关卡随机变化。可在浏览器即刻游玩。", "미라의 횡스크롤 엔드리스 STG. 1분마다 강화 보스가 등장하고 3종 스테이지가 랜덤 변화. 브라우저에서 바로 플레이."],
    "YouTubeで公開中のアニメMV。TikTokでもバズ多数の話題作をチェック。":
      ["An anime MV on YouTube. Check out this hit that's also gone viral on TikTok.", "MV anime di YouTube. Simak karya viral yang juga populer di TikTok.", "Un MV de anime en YouTube. Mira este éxito que también se hizo viral en TikTok.", "在YouTube公开的动画MV。快看在TikTok也爆红的话题之作。", "YouTube에 공개 중인 애니메이션 MV. TikTok에서도 화제인 인기작을 확인하세요."],
    "楽曲、BGM、MV、外部配信サービスへのリンクをまとめ、ミラの活動の音を見せるセクションです。":
      ["A section gathering tracks, BGM, MVs and links to streaming services—the sound of Mira's activity.", "Bagian yang mengumpulkan lagu, BGM, MV, dan tautan layanan streaming—suara aktivitas Mira.", "Sección que reúne canciones, BGM, MVs y enlaces a servicios de streaming: el sonido de Mira.", "汇集歌曲、BGM、MV及外部流媒体链接，展现米拉活动之声的版块。", "곡, BGM, MV, 외부 스트리밍 링크를 모아 미라의 활동의 소리를 보여주는 섹션입니다."],
    "ミラのキーホルダー、アクリル系アイテム、イベント向け小物などを紹介。BOOTHで販売中。":
      ["Mira keychains, acrylic items, event goods and more. On sale at BOOTH.", "Gantungan kunci Mira, item akrilik, merch acara, dll. Dijual di BOOTH.", "Llaveros de Mira, artículos acrílicos, merch para eventos y más. A la venta en BOOTH.", "介绍米拉钥匙扣、亚克力周边、活动小物等。BOOTH发售中。", "미라 키홀더, 아크릴 아이템, 이벤트 굿즈 등을 소개. BOOTH에서 판매 중."],
    "ミラの未来視の世界設定、キャラ、年表、キービジュアルを整理して、初見の人にも伝わる入口にします。":
      ["An entry point organizing Mira Vision's lore, characters, timeline and key visuals—clear even for newcomers.", "Pintu masuk yang merapikan latar dunia, karakter, linimasa, dan key visual Mira Vision—jelas bahkan bagi pendatang baru.", "Un punto de entrada que organiza el lore, personajes, cronología y key visuals de Mira Vision, claro incluso para novatos.", "整理米拉未来视的世界设定、角色、年表与主视觉，打造初见者也能理解的入口。", "미라의 미래시 세계관, 캐릭터, 연표, 키비주얼을 정리해 처음 보는 사람에게도 전달되는 입구로."],
    "Live2D、会話、歌、配信告知を接続していく実験室。現在制作中で、完成後はサイトの看板体験になります。":
      ["A lab connecting Live2D, chat, singing and stream announcements. In development—once done it'll be the site's flagship experience.", "Lab yang menghubungkan Live2D, obrolan, nyanyian, dan info siaran. Dalam pengembangan—kelak jadi pengalaman unggulan situs.", "Un laboratorio que conecta Live2D, chat, canto y avisos de directo. En desarrollo; será la experiencia estrella del sitio.", "连接Live2D、对话、歌唱、直播预告的实验室。制作中，完成后将成为网站的招牌体验。", "Live2D, 대화, 노래, 방송 공지를 연결하는 실험실. 제작 중이며 완성 후 사이트의 간판 경험이 됩니다."],
    "「こうしてほしい」「応援」「バグ報告」などを送れる要望ボード。ログイン不要。いただいた声はサイトに反映していきます。":
      ["A request board for feedback, cheers and bug reports. No login needed. We reflect your voices into the site.", "Papan untuk permintaan, dukungan, dan laporan bug. Tanpa login. Suaramu kami wujudkan di situs.", "Un buzón para sugerencias, ánimos y reportes de errores. Sin login. Reflejamos tus voces en el sitio.", "可提交建议、应援、Bug报告的意见板。无需登录。我们会把大家的心声反映到网站上。", "요청·응원·버그 제보를 보낼 수 있는 게시판. 로그인 불필요. 여러분의 의견을 사이트에 반영합니다."],
    // ---- board.html data-i18n keys (ui) handled below ----
    "": [""]
  };

  var UI = {
    board_title: ["Request Board", "Papan Permintaan", "Buzón de Sugerencias", "意见反馈板", "요청 게시판"],
    board_sub: ["Send anything—wishes, cheers, bug reports—for Mira Vision. Our staff reads every message and reflects the good ones into the site. No login required.",
      "Kirim apa saja—harapan, dukungan, laporan bug—untuk Mira Vision. Staf membaca setiap pesan dan mewujudkan yang terbaik di situs. Tanpa login.",
      "Envía lo que quieras—deseos, ánimos, reportes de errores—para Mira Vision. Nuestro equipo lee cada mensaje y refleja los mejores en el sitio. Sin login.",
      "为米拉未来视发送任何内容——期望、应援、Bug报告。工作人员会阅读每条留言，并将优秀内容反映到网站。无需登录。",
      "미라의 미래시에 바라는 점·응원·버그 제보 등 무엇이든 보내주세요. 스태프가 모든 메시지를 확인하고 좋은 의견은 사이트에 반영합니다. 로그인 불필요."],
    board_thanks_h: ["Thank you!", "Terima kasih!", "¡Gracias!", "感谢你！", "감사합니다!"],
    board_thanks_p: ["Your message reached us. Stay tuned for updates.", "Pesanmu sampai. Nantikan pembaruannya.", "Tu mensaje nos llegó. Atento a las novedades.", "你的心声已送达。敬请期待反映。", "당신의 목소리가 도착했어요. 반영을 기대해 주세요."],
    board_back: ["← Back to Home", "← Kembali ke Beranda", "← Volver al Inicio", "← 返回首页", "← 홈으로 돌아가기"],
    board_name: ["Name / Nickname (optional)", "Nama / Nama panggilan (opsional)", "Nombre / Apodo (opcional)", "姓名・昵称（可选）", "이름·닉네임 (선택)"],
    board_lang: ["Language (optional)", "Bahasa (opsional)", "Idioma (opcional)", "语言（可选）", "언어 (선택)"],
    board_msg: ["Request / Message *", "Permintaan / Pesan *", "Sugerencia / Mensaje *", "意见・留言 *", "요청·메시지 *"],
    board_send: ["Send", "Kirim", "Enviar", "发送", "보내기"],
    board_note: ["* Submissions go only to our staff (not public). A captcha may appear as spam protection. Please avoid personal info and abusive language.",
      "* Kiriman hanya sampai ke staf (tidak publik). Captcha bisa muncul sebagai proteksi spam. Hindari data pribadi dan ujaran kebencian.",
      "* Los envíos van solo a nuestro equipo (no públicos). Puede aparecer un captcha como protección antispam. Evita datos personales y lenguaje ofensivo.",
      "* 提交内容仅发送给工作人员（不会公开）。为防垃圾信息可能出现验证码。请勿填写个人信息或进行人身攻击。",
      "* 제출 내용은 스태프에게만 전달됩니다(비공개). 스팸 방지를 위해 캡차가 표시될 수 있습니다. 개인정보·비방은 삼가주세요."]
  };

  function curLang() { return localStorage.getItem("mvLang") || "ja"; }

  function apply(lang) {
    var i = IDX[lang];
    document.documentElement.lang = lang;
    // data-i18n keyed elements
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var k = 0; k < nodes.length; k++) {
      var key = nodes[k].getAttribute("data-i18n");
      if (!nodes[k].__src) nodes[k].__src = nodes[k].textContent; // remember JA source
      if (lang === "ja") { nodes[k].textContent = nodes[k].__src; }
      else if (UI[key] && UI[key][i] != null) nodes[k].textContent = UI[key][i];
    }
    // text-node dictionary replacement (homepage cards etc.)
    walk(document.body, lang, i);
    var lc = document.getElementById("mvLangCur");
    if (lc) { var L = LANGS.filter(function (x) { return x.c === lang; })[0]; lc.textContent = "🌐 " + (L ? L.n : "日本語"); }
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, IFRAME: 1, CANVAS: 1, SVG: 1 };
  function walk(root, lang, i) {
    var jobs = [];
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (p.id === "news-ticker" || (p.closest && p.closest("#mvLangSwitch,#news-ticker"))) return NodeFilter.FILTER_REJECT;
        var key = node.nodeValue.trim();
        if (!key || key.length > 220) return NodeFilter.FILTER_REJECT;
        if (node.__src || T[key]) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = tw.nextNode())) { if (!n.__src) n.__src = n.nodeValue.trim(); jobs.push(n); }
    for (var j = 0; j < jobs.length; j++) {
      var node = jobs[j], src = node.__src, out = src;
      if (lang !== "ja" && T[src] && T[src][i] != null) out = T[src][i];
      if (node.nodeValue.trim() !== out) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), out);
    }
  }

  function buildSwitcher() {
    if (document.getElementById("mvLangSwitch")) return;
    var css = document.createElement("style");
    css.textContent =
      "#mvLangSwitch{position:fixed;top:46px;right:12px;z-index:99998;font-family:system-ui,sans-serif}" +
      "#mvLangCur{cursor:pointer;background:rgba(12,14,34,.86);color:#dbe6ff;border:1px solid rgba(150,180,255,.4);" +
      "border-radius:999px;padding:7px 14px;font-size:12px;letter-spacing:.04em;backdrop-filter:blur(6px)}" +
      "#mvLangMenu{position:absolute;right:0;margin-top:6px;background:rgba(10,12,30,.97);border:1px solid rgba(150,180,255,.35);" +
      "border-radius:12px;overflow:hidden;display:none;min-width:150px;box-shadow:0 14px 40px rgba(0,0,0,.5)}" +
      "#mvLangMenu.open{display:block}" +
      "#mvLangMenu button{display:block;width:100%;text-align:left;background:none;border:none;color:#dbe6ff;" +
      "padding:10px 16px;font-size:13px;cursor:pointer}" +
      "#mvLangMenu button:hover{background:rgba(120,150,255,.22)}";
    document.head.appendChild(css);
    var wrap = document.createElement("div");
    wrap.id = "mvLangSwitch";
    wrap.innerHTML = '<div id="mvLangCur">🌐 日本語</div><div id="mvLangMenu"></div>';
    document.body.appendChild(wrap);
    var menu = wrap.querySelector("#mvLangMenu");
    LANGS.forEach(function (L) {
      var b = document.createElement("button");
      b.textContent = L.n; b.setAttribute("data-lang", L.c);
      b.addEventListener("click", function () {
        localStorage.setItem("mvLang", L.c); menu.classList.remove("open"); apply(L.c);
      });
      menu.appendChild(b);
    });
    wrap.querySelector("#mvLangCur").addEventListener("click", function (e) {
      e.stopPropagation(); menu.classList.toggle("open");
    });
    document.addEventListener("click", function () { menu.classList.remove("open"); });
  }

  function boot() {
    buildSwitcher();
    apply(curLang());
    // re-apply a few times to catch asynchronously-rendered cards (no continuous observer = no freeze)
    [400, 1000, 2000, 3500].forEach(function (ms) {
      setTimeout(function () { apply(curLang()); }, ms);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
