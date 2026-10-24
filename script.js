/* ===================================================================
   CampusAccess — script.js
   Vanilla JavaScript. No frameworks. Runs by opening index.html.
   =================================================================== */
(function () {
  "use strict";

  /* ===================== Config ===================== */
  var MAX_BYTES = 8 * 1024 * 1024; // 8 MB
  var STORE_KEY = "campusaccess.docs.v1";
  var PREF_KEY = "campusaccess.prefs.v1";
  var STATS_KEY = "campusaccess.stats.v1";

  // Configure pdf.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ===================== State ===================== */
  var docs = [];        // {id, name, size, type, text, addedAt}
  var resources = [];   // {id, docId, type, title, body, createdAt}
  var stats = { searches: 0 };

  /* ===================== Storage ===================== */
  function load() {
    try { docs = JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { docs = []; }
    try { resources = JSON.parse(localStorage.getItem("campusaccess.resources.v1")) || []; } catch (e) { resources = []; }
    try { stats = JSON.parse(localStorage.getItem(STATS_KEY)) || { searches: 0 }; } catch (e) { stats = { searches: 0 }; }
  }
  function saveDocs() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(docs)); }
    catch (e) { toast("Storage full — older documents may not persist.", "error"); }
  }
  function saveResources() {
    try { localStorage.setItem("campusaccess.resources.v1", JSON.stringify(resources)); } catch (e) {}
  }
  function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {} }

  /* ===================== Preferences ===================== */
  function loadPrefs() {
    var p = {}; try { p = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) {}
    if (p.theme) setTheme(p.theme);
    if (p.textsize) setTextSize(p.textsize);
    if (p.dyslexia) toggleClass("dyslexia", true, "opt-dyslexia");
    if (p.linefocus) toggleClass("linefocus", true, "opt-linefocus");
    if (p.reduceMotion) toggleClass("reduce-motion", true, "opt-reduce-motion");
  }
  function savePrefs() {
    var p = {
      theme: document.documentElement.getAttribute("data-theme"),
      textsize: document.documentElement.getAttribute("data-textsize"),
      dyslexia: !!document.body.classList.contains("dyslexia"),
      linefocus: !!document.body.classList.contains("linefocus"),
      reduceMotion: !!document.body.classList.contains("reduce-motion")
    };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* ===================== Helpers ===================== */
  function $(s, ctx) { return (ctx || document).querySelector(s); }
  function $all(s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function fmtSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }
  function fmtDate(ts) { return new Date(ts).toLocaleString(); }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function wordCount(s) { s = (s || "").trim(); return s ? s.split(/\s+/).length : 0; }

  var toastTimer;
  function toast(msg, type) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (type ? " " + type : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; t.hidden = true; }, 3200);
  }

  function fileIcon(type) {
    var m = {
      txt: "TXT", csv: "CSV", html: "HTML", htm: "HTML", md: "MD", pdf: "PDF",
      docx: "DOC", pptx: "PPT", xlsx: "XLS", json: "JSN", xml: "XML", log: "LOG", rtf: "RTF"
    };
    return m[type] || "DOC";
  }

  /* ===================== Navigation ===================== */
  function showView(name) {
    $all(".view").forEach(function (v) { v.classList.remove("active"); });
    var v = $("#view-" + name);
    if (v) v.classList.add("active");
    $all(".nav-link").forEach(function (n) {
      var active = n.getAttribute("data-view") === name;
      n.classList.toggle("active", active);
      if (active) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current");
    });
    closeMobileNav();
    window.scrollTo(0, 0);
    if (name === "dashboard") renderDashboard();
    if (name === "resources") populateResourceSources();
    if (name === "library") renderLibrary();
  }

  function closeMobileNav() {
    var nav = $(".main-nav"); if (nav) nav.classList.remove("open");
    var btn = $("#nav-menu-btn"); if (btn) btn.setAttribute("aria-expanded", "false");
  }

  /* ===================== Accessibility ===================== */
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $all(".theme-btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-theme") === theme); });
    savePrefs();
  }
  function setTextSize(size) {
    document.documentElement.setAttribute("data-textsize", size);
    $all(".size-btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-size") === size); });
    savePrefs();
  }
  function toggleClass(cls, on, checkboxId) {
    document.body.classList.toggle(cls, on);
    if (checkboxId) { var c = $("#" + checkboxId); if (c) c.checked = on; }
    savePrefs();
  }

  /* ===================== File extraction ===================== */
  function getExt(name) {
    var i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  }

  // Build a rough HTML-to-text converter (no DOMParser dependency for fragments)
  function htmlToText(html) {
    // Replace block tags with newlines, strip tags, decode entities
    var s = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|header|footer|ul|ol)>/gi, "\n")
      .replace(/<(td|th)[^>]*>/gi, "\t")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return s;
  }

  function extractText(file, cb) {
    var ext = getExt(file.name);
    var reader = new FileReader();

    // Native text-based formats
    var native = ["txt", "csv", "html", "htm", "md", "json", "xml", "log", "rtf"];
    if (native.indexOf(ext) >= 0) {
      reader.onload = function () {
        var raw = String(reader.result || "");
        if (ext === "html" || ext === "htm") raw = htmlToText(raw);
        if (ext === "rtf") raw = stripRtf(raw);
        cb(null, raw.replace(/\r/g, "").trim());
      };
      reader.onerror = function () { cb("Could not read file."); };
      reader.readAsText(file);
      return;
    }

    // PDF via pdf.js
    if (ext === "pdf") {
      if (!window.pdfjsLib) return cb("PDF library (pdf.js) failed to load. Check your internet connection.");
      var reader2 = new FileReader();
      reader2.onload = function () {
        try {
          var task = window.pdfjsLib.getDocument({ data: new Uint8Array(reader2.result) });
          task.promise.then(function (pdf) {
            var total = pdf.numPages, collected = [], i = 1;
            function next() {
              if (i > total) { cb(null, collected.join("\n\n").trim()); return; }
              pdf.getPage(i).then(function (page) {
                page.getTextContent().then(function (content) {
                  var txt = content.items.map(function (it) { return it.str; }).join(" ");
                  collected.push(txt);
                  i++; next();
                });
              }).catch(function () { i++; next(); });
            }
            next();
          }).catch(function (e) { cb("PDF extraction failed: " + (e.message || "corrupted file")); });
        } catch (e) { cb("PDF extraction failed: " + (e.message || "unknown error")); }
      };
      reader2.onerror = function () { cb("Could not read PDF file."); };
      reader2.readAsArrayBuffer(file);
      return;
    }

    // DOCX via Mammoth
    if (ext === "docx") {
      if (!window.mammoth) return cb("DOCX library (Mammoth) failed to load. Check your internet connection.");
      var r3 = new FileReader();
      r3.onload = function () {
        window.mammoth.extractRawText({ arrayBuffer: r3.result })
          .then(function (r) { cb(null, (r.value || "").trim()); })
          .catch(function (e) { cb("DOCX extraction failed: " + (e.message || "invalid file")); });
      };
      r3.onerror = function () { cb("Could not read DOCX file."); };
      r3.readAsArrayBuffer(file);
      return;
    }

    // XLSX via SheetJS
    if (ext === "xlsx") {
      if (!window.XLSX) return cb("XLSX library (SheetJS) failed to load. Check your internet connection.");
      var r4 = new FileReader();
      r4.onload = function () {
        try {
          var wb = window.XLSX.read(r4.result, { type: "array" });
          var lines = [];
          wb.SheetNames.forEach(function (name) {
            lines.push("## Sheet: " + name);
            var ws = wb.Sheets[name];
            lines.push(window.XLSX.utils.sheet_to_csv(ws));
          });
          cb(null, lines.join("\n\n").trim());
        } catch (e) { cb("XLSX extraction failed: " + (e.message || "invalid file")); }
      };
      r4.onerror = function () { cb("Could not read XLSX file."); };
      r4.readAsArrayBuffer(file);
      return;
    }

    // PPTX via JSZip (extract slide XML text)
    if (ext === "pptx") {
      if (!window.JSZip) return cb("PPTX library (JSZip) failed to load. Check your internet connection.");
      var r5 = new FileReader();
      r5.onload = function () {
        window.JSZip.loadAsync(r5.result).then(function (zip) {
          var slideFiles = Object.keys(zip.files)
            .filter(function (n) { return /^ppt\/slides\/slide[0-9]+\.xml$/.test(n); })
            .sort(function (a, b) {
              var na = parseInt(a.match(/slide([0-9]+)/)[1], 10);
              var nb = parseInt(b.match(/slide([0-9]+)/)[1], 10);
              return na - nb;
            });
          if (!slideFiles.length) { cb(null, ""); return; }
          var collected = [], idx = 0;
          function nextSlide() {
            if (idx >= slideFiles.length) { cb(null, collected.join("\n\n").trim()); return; }
            var sf = slideFiles[idx];
            zip.files[sf].async("string").then(function (xml) {
              // Extract <a:t>…</a:t> text runs
              var matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
              var text = matches.map(function (m) { return m.replace(/<[^>]+>/g, ""); }).join(" ");
              collected.push("Slide " + (idx + 1) + ": " + text);
              idx++; nextSlide();
            }).catch(function () { idx++; nextSlide(); });
          }
          nextSlide();
        }).catch(function (e) { cb("PPTX extraction failed: " + (e.message || "invalid file")); });
      };
      r5.onerror = function () { cb("Could not read PPTX file."); };
      r5.readAsArrayBuffer(file);
      return;
    }

    cb('Unsupported format ".' + ext + '". Supported: TXT, CSV, HTML, MD, JSON, XML, PDF, DOCX, XLSX, PPTX.');
  }

  function stripRtf(s) {
    // Very basic RTF text extraction
    return s.replace(/\\par[d]?/g, "\n")
      .replace(/\\'[0-9a-f]{2}/g, "")
      .replace(/\\[a-z]+-?[0-9]* ?/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\\*[\w]+ /g, "")
      .trim();
  }

  /* ===================== Upload handling ===================== */
  function handleFiles(files) {
    Array.prototype.slice.call(files).forEach(function (file) {
      processFile(file);
    });
  }

  function processFile(file) {
    var ext = getExt(file.name);

    // Validation
    if (file.size === 0) { addUploadItem(file, "error", "File is empty."); return; }
    if (file.size > MAX_BYTES) { addUploadItem(file, "error", "File exceeds " + fmtSize(MAX_BYTES) + " limit."); return; }

    var item = addUploadItem(file, "processing", "Extracting text…");

    extractText(file, function (err, text) {
      if (err) {
        item.classList.remove("processing"); item.classList.add("error");
        setUploadStatus(item, "error", err);
        toast(err, "error");
        return;
      }
      if (!text || !text.trim()) {
        item.classList.remove("processing"); item.classList.add("error");
        setUploadStatus(item, "error", "No text could be extracted from this file.");
        toast("No text extracted from " + file.name, "error");
        return;
      }
      var doc = {
        id: uid(),
        name: file.name,
        size: file.size,
        type: ext,
        text: text,
        addedAt: Date.now()
      };
      docs.push(doc);
      saveDocs();
      item.classList.remove("processing"); item.classList.add("done");
      setUploadStatus(item, "done", fmtSize(file.size) + " · " + wordCount(text) + " words");
      updateProgress(item, 100);
      toast("Uploaded " + file.name, "success");
      renderDashboard();
    });
  }

  function addUploadItem(file, state, msg) {
    var list = $("#upload-list");
    var item = el("div", "upload-item " + state);
    item.innerHTML =
      '<div class="doc-ico">' + esc(fileIcon(getExt(file.name))) + '</div>' +
      '<div class="doc-meta"><div class="doc-name">' + esc(file.name) + '</div>' +
      '<div class="status-msg">' + esc(msg || "") + '</div></div>' +
      '<div class="progress-bar"><div class="progress-fill"></div></div>';
    list.appendChild(item);
    updateProgress(item, state === "processing" ? 30 : 0);
    return item;
  }
  function setUploadStatus(item, state, msg) {
    var sm = item.querySelector(".status-msg");
    if (sm) sm.textContent = msg;
  }
  function updateProgress(item, pct) {
    var f = item.querySelector(".progress-fill");
    if (f) f.style.width = pct + "%";
  }

  /* ===================== Dashboard ===================== */
  function renderDashboard() {
    $("#stat-docs").textContent = docs.length;
    var tw = docs.reduce(function (a, d) { return a + wordCount(d.text); }, 0);
    $("#stat-words").textContent = tw.toLocaleString();
    $("#stat-resources").textContent = resources.length;
    $("#stat-searches").textContent = stats.searches;

    var rc = $("#recent-docs");
    if (!docs.length) {
      rc.innerHTML = '<p class="empty-state">No documents yet. Upload your first file to get started.</p>';
      return;
    }
    var recent = docs.slice().sort(function (a, b) { return b.addedAt - a.addedAt; }).slice(0, 5);
    rc.innerHTML = "";
    recent.forEach(function (d) { rc.appendChild(docItem(d)); });
  }

  function docItem(d) {
    var item = el("div", "doc-item");
    item.innerHTML =
      '<div class="doc-ico">' + esc(fileIcon(d.type)) + '</div>' +
      '<div class="doc-meta"><div class="doc-name">' + esc(d.name) + '</div>' +
      '<div class="doc-sub">' + esc(fmtSize(d.size)) + ' · ' + wordCount(d.text) + ' words · ' + esc(fmtDate(d.addedAt)) + '</div></div>' +
      '<div class="doc-actions">' +
      '<button class="icon-btn" title="Preview" data-preview="' + d.id + '">👁</button>' +
      '<button class="icon-btn" title="Generate resources" data-go="resources" data-doc="' + d.id + '">★</button>' +
      '<button class="icon-btn" title="Delete" data-delete="' + d.id + '">🗑</button>' +
      '</div>';
    return item;
  }

  /* ===================== Library ===================== */
  function renderLibrary() {
    var list = $("#library-list");
    list.innerHTML = "";
    if (!docs.length) {
      list.innerHTML = '<p class="empty-state">No documents in your library yet.</p>';
      return;
    }
    docs.slice().sort(function (a, b) { return b.addedAt - a.addedAt; }).forEach(function (d) {
      list.appendChild(docItem(d));
    });
  }

  function deleteDoc(id) {
    if (!confirm("Delete this document and its generated resources?")) return;
    docs = docs.filter(function (d) { return d.id !== id; });
    resources = resources.filter(function (r) { return r.docId !== id; });
    saveDocs(); saveResources();
    renderDashboard(); renderLibrary(); populateResourceSources();
    toast("Document deleted.");
  }

  function clearAll() {
    if (!docs.length) { toast("Library is already empty."); return; }
    if (!confirm("Delete ALL documents and resources? This cannot be undone.")) return;
    docs = []; resources = []; stats = { searches: 0 };
    saveDocs(); saveResources(); saveStats();
    renderDashboard(); renderLibrary(); populateResourceSources();
    toast("All documents cleared.");
  }

  /* ===================== Preview modal ===================== */
  function openPreview(id) {
    var d = findDoc(id); if (!d) return;
    $("#preview-title").textContent = d.name;
    $("#preview-meta").innerHTML =
      "<strong>Type:</strong> " + esc(d.type.toUpperCase()) + " · " +
      "<strong>Size:</strong> " + esc(fmtSize(d.size)) + " · " +
      "<strong>Words:</strong> " + wordCount(d.text) + " · " +
      "<strong>Added:</strong> " + esc(fmtDate(d.addedAt));
    $("#preview-text").textContent = d.text;
    $("#preview-export").onclick = function () { downloadTxt(d.name + ".txt", d.text); };
    $("#preview-read").onclick = function () { speak(d.text); };
    var m = $("#preview-modal"); m.hidden = false;
    $("#preview-text").focus();
  }
  function closePreview() { $("#preview-modal").hidden = true; }

  function findDoc(id) {
    for (var i = 0; i < docs.length; i++) if (docs[i].id === id) return docs[i];
    return null;
  }

  /* ===================== Resource generation ===================== */
  function populateResourceSources() {
    var sel = $("#res-source");
    sel.innerHTML = "";
    if (!docs.length) {
      sel.innerHTML = '<option value="">No documents — upload first</option>';
      $("#res-generate").disabled = true;
      return;
    }
    $("#res-generate").disabled = false;
    docs.forEach(function (d) {
      var o = el("option", null, esc(d.name));
      o.value = d.id; sel.appendChild(o);
    });
    // Pre-select from data-doc attribute
    var pre = sel.getAttribute("data-preselect");
    if (pre) { sel.value = pre; sel.removeAttribute("data-preselect"); }
  }

  function generateResource() {
    var docId = $("#res-source").value;
    var type = $("#res-type").value;
    var length = $("#res-length").value;
    var d = findDoc(docId);
    if (!d) { toast("Select a document first.", "error"); return; }

    var body = "";
    switch (type) {
      case "summary": body = genSummary(d.text, length); break;
      case "bullets": body = genBullets(d.text, length); break;
      case "keyterms": body = genKeyTerms(d.text, length); break;
      case "table": body = genTable(d.text); break;
      case "formulas": body = genFormulas(d.text); break;
      case "revision": body = genRevision(d.text, length); break;
      case "simplified": body = genSimplified(d.text, length); break;
    }

    var titleMap = {
      summary: "Detailed Summary", bullets: "Bullet Points", keyterms: "Key Terms & Definitions",
      table: "Comparison Table", formulas: "Formulas & Examples", revision: "Revision Sheet",
      simplified: "Simplified Reading"
    };
    var res = {
      id: uid(), docId: d.id, type: type, title: titleMap[type],
      body: body, createdAt: Date.now()
    };
    resources.unshift(res);
    saveResources();
    renderDashboard();
    renderResource(res, d);
    toast(res.title + " generated.", "success");
  }

  function renderResource(res, d) {
    var out = $("#res-output");
    var meta = '<div class="res-meta">Source: <strong>' + esc(d.name) + '</strong> · Generated ' + esc(fmtDate(res.createdAt)) + '</div>';
    var toolbar =
      '<div class="res-toolbar">' +
      '<button class="btn btn-primary" id="res-export">Export .txt</button>' +
      '<button class="btn" id="res-read">Read aloud</button>' +
      '<button class="btn btn-ghost" id="res-copy">Copy to clipboard</button>' +
      '</div>';
    out.innerHTML = toolbar + meta + "<h2>" + esc(res.title) + "</h2>" + res.body;
    $("#res-export").onclick = function () { downloadTxt(res.title + " — " + d.name + ".txt", stripHtml(res.body)); };
    $("#res-read").onclick = function () { speak(stripHtml(res.body)); };
    $("#res-copy").onclick = function () {
      copyToClipboard(stripHtml(res.body));
      toast("Copied to clipboard.", "success");
    };
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* --- text analysis helpers --- */
  function sentences(text) {
    return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(function (s) {
      return s.trim().length > 0;
    });
  }
  function wordsArray(text) {
    return text.toLowerCase().match(/[a-z][a-z'-]+/g) || [];
  }
  function stopWords() {
    return "the a an and or but is are was were be been being to of in on at by for with from as it its this that these those he she they we you i not no do does did has have had will would can could should may might must shall their there here than then so such very more most each every which who whom whose what when where why how into over under again further once also just about up out off down".split(" ");
  }
  function topKeywords(text, n) {
    var sw = stopWords();
    var freq = {};
    var ws = wordsArray(text).filter(function (w) { return w.length > 3 && sw.indexOf(w) < 0; });
    ws.forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
    return Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, n);
  }
  function scoreSentence(s, keywords) {
    var words = wordsArray(s);
    var score = 0;
    words.forEach(function (w) { if (keywords.indexOf(w) >= 0) score += 1; });
    score = score / Math.max(words.length, 1);
    if (s.length > 40 && s.length < 200) score += 0.05;
    if (/\d/.test(s)) score += 0.03;
    return score;
  }

  /* --- Resource generators --- */
  function genSummary(text, length) {
    var sents = sentences(text);
    var target = length === "short" ? 3 : length === "long" ? 8 : 5;
    if (sents.length <= target) return "<p>" + esc(sents.join(" ")) + "</p>";
    var kw = topKeywords(text, 20);
    var scored = sents.map(function (s, i) {
      return { s: s, i: i, score: scoreSentence(s, kw) };
    });
    // Keep order but pick top-scored
    scored.sort(function (a, b) { return b.score - a.score; });
    var picked = scored.slice(0, target).sort(function (a, b) { return a.i - b.i; });
    var paras = [];
    var chunk = Math.ceil(picked.length / Math.min(3, target));
    for (var i = 0; i < picked.length; i += chunk) {
      paras.push("<p>" + esc(picked.slice(i, i + chunk).map(function (p) { return p.s; }).join(" ")) + "</p>");
    }
    return paras.join("\n");
  }

  function genBullets(text, length) {
    var sents = sentences(text);
    var target = length === "short" ? 6 : length === "long" ? 16 : 10;
    var kw = topKeywords(text, 15);
    var scored = sents.map(function (s, i) {
      return { s: s, i: i, score: scoreSentence(s, kw) };
    }).sort(function (a, b) { return b.score - a.score; });
    var picked = scored.slice(0, Math.min(target, sents.length)).sort(function (a, b) { return a.i - b.i; });
    var items = picked.map(function (p) {
      var clean = p.s.replace(/\s+/g, " ").trim();
      return "<li>" + esc(clean) + "</li>";
    });
    return "<ul>" + items.join("") + "</ul>";
  }

  function genKeyTerms(text, length) {
    var n = length === "short" ? 6 : length === "long" ? 16 : 10;
    var kw = topKeywords(text, n * 3);
    // Build definitions from surrounding context
    var sents = sentences(text);
    var cards = kw.slice(0, n).map(function (term) {
      var def = "";
      for (var i = 0; i < sents.length; i++) {
        if (sents[i].toLowerCase().indexOf(term) >= 0) { def = sents[i].trim(); break; }
      }
      if (!def) def = "Key term found in the document.";
      return '<div class="term-card"><span class="term">' + esc(term) + '</span> — ' + esc(def) + '</div>';
    });
    return cards.join("\n");
  }

  function genTable(text) {
    // Detect tabular data: lines with tabs or multiple commas, or markdown tables
    var lines = text.split("\n").map(function (l) { return l.trim(); });
    var tableLines = lines.filter(function (l) {
      return l.split("\t").length >= 3 || (l.split(",").length >= 3 && l.length < 200);
    });
    if (tableLines.length >= 2) {
      var delim = tableLines[0].indexOf("\t") >= 0 ? "\t" : ",";
      var rows = tableLines.slice(0, 12).map(function (l) { return l.split(delim); });
      var html = "<table>";
      html += "<thead><tr>" + rows[0].map(function (c) { return "<th>" + esc(c.trim()) + "</th>"; }).join("") + "</tr></thead>";
      html += "<tbody>";
      rows.slice(1).forEach(function (r) {
        html += "<tr>" + r.map(function (c) { return "<td>" + esc(c.trim()) + "</td>"; }).join("") + "</tr>";
      });
      html += "</tbody></table>";
      return html;
    }
    // Fallback: comparison table from top keywords
    var kw = topKeywords(text, 5);
    var sents = sentences(text);
    var html = "<table><thead><tr><th>Concept</th><th>Context in document</th></tr></thead><tbody>";
    kw.forEach(function (term) {
      var ctx = "";
      for (var i = 0; i < sents.length; i++) {
        if (sents[i].toLowerCase().indexOf(term) >= 0) { ctx = sents[i].trim(); break; }
      }
      html += "<tr><td><strong>" + esc(term) + "</strong></td><td>" + esc(ctx || "—") + "</td></tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function genFormulas(text) {
    // Find lines containing formula-like patterns: =, math symbols, percentages
    var lines = text.split("\n");
    var formulas = lines.filter(function (l) {
      l = l.trim();
      return l.length > 3 && l.length < 200 &&
        (/[=×÷+\-±≈≤≥√∑∫%]/.test(l) || /\bformula\b|\bequation\b|\bcalculate\b/i.test(l));
    });
    var examples = lines.filter(function (l) {
      l = l.trim();
      return /\bexample\b|\be\.g\b|\bfor instance\b/i.test(l) && l.length < 200;
    });
    var html = "";
    if (formulas.length) {
      html += "<h3>Detected formulas & equations</h3><ul>";
      formulas.slice(0, 12).forEach(function (f) { html += "<li><code>" + esc(f) + "</code></li>"; });
      html += "</ul>";
    } else {
      html += "<p>No explicit formulas detected. Here are key sentences with numeric content:</p><ul>";
      sentences(text).filter(function (s) { return /\d/.test(s); }).slice(0, 8)
        .forEach(function (s) { html += "<li>" + esc(s.trim()) + "</li>"; });
      html += "</ul>";
    }
    if (examples.length) {
      html += "<h3>Examples from text</h3><ul>";
      examples.slice(0, 8).forEach(function (e) { html += "<li>" + esc(e) + "</li>"; });
      html += "</ul>";
    }
    return html || "<p>No formulas or examples found in this document.</p>";
  }

  function genRevision(text, length) {
    var kw = topKeywords(text, length === "short" ? 8 : length === "long" ? 20 : 14);
    var sents = sentences(text);
    var html = "<h3>Quick recap</h3><p>" + esc(sents.slice(0, 2).join(" ")) + "</p>";
    html += "<h3>Key points to remember</h3><ul>";
    kw.forEach(function (term) {
      var ctx = "";
      for (var i = 0; i < sents.length; i++) {
        if (sents[i].toLowerCase().indexOf(term) >= 0) { ctx = sents[i].trim(); break; }
      }
      html += "<li><strong>" + esc(term) + "</strong> — " + esc(ctx || "see document") + "</li>";
    });
    html += "</ul>";
    // Self-quiz
    html += "<h3>Self-check questions</h3><ol>";
    kw.slice(0, 5).forEach(function (term) {
      html += "<li>What is the significance of <strong>" + esc(term) + "</strong> in this material?</li>";
    });
    html += "</ol>";
    return html;
  }

  function genSimplified(text, length) {
    // Shorten sentences, strip subordinate clauses, use simpler structure
    var sents = sentences(text);
    var target = length === "short" ? 5 : length === "long" ? 14 : 9;
    var simplified = sents.slice(0, target * 2).map(function (s) {
      // Cut at first semicolon or comma-heavy subordinate clause
      var short = s.split(/;/)[0];
      // Remove parentheticals
      short = short.replace(/\([^)]*\)/g, "").trim();
      // If still too long, cut at a mid-sentence comma
      if (short.length > 120) {
        var parts = short.split(",");
        if (parts.length > 2) short = parts.slice(0, 2).join(",");
      }
      return short;
    }).filter(function (s) { return s.length > 10; }).slice(0, target);

    var html = "<p>The following is a simplified version of the document, keeping the main ideas:</p>";
    html += simplified.map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("\n");
    if (simplified.length === 0) html = "<p>The document is too short to simplify further.</p>";
    return html;
  }

  function stripHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent || d.innerText || "";
  }

  /* ===================== Ask Your Files ===================== */
  function performSearch(query, opts) {
    var out = $("#ask-results");
    var count = $("#ask-count");
    out.innerHTML = "";

    if (!docs.length) { out.innerHTML = '<p class="empty-state">Upload documents first, then search.</p>'; count.textContent = ""; return; }
    if (!query.trim()) { out.innerHTML = '<p class="empty-state">Enter a search term above.</p>'; count.textContent = ""; return; }

    stats.searches++; saveStats(); renderDashboard();

    var whole = opts.whole, caseSensitive = opts.caseSensitive;
    var flags = caseSensitive ? "g" : "gi";
    var pattern = whole ? "\\b" + escapeRegex(query) + "\\b" : escapeRegex(query);
    var re;
    try { re = new RegExp(pattern, flags); }
    catch (e) { out.innerHTML = '<p class="empty-state">Invalid search pattern.</p>'; return; }

    var results = [];
    docs.forEach(function (d) {
      var text = d.text;
      var m;
      var snippetCount = 0;
      while ((m = re.exec(text)) !== null && snippetCount < 5) {
        var start = Math.max(0, m.index - 80);
        var end = Math.min(text.length, m.index + query.length + 80);
        var snippet = text.substring(start, end);
        var prefix = start > 0 ? "…" : "";
        var suffix = end < text.length ? "…" : "";
        var marked = esc(snippet).replace(new RegExp(escapeRegex(esc(query)), flags), function (x) {
          return "<mark>" + x + "</mark>";
        });
        results.push({ name: d.name, snippet: prefix + marked + suffix });
        snippetCount++;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });

    if (!results.length) {
      out.innerHTML = '<p class="empty-state">No matches found across your documents.</p>';
      count.textContent = "0 matches";
      return;
    }
    count.textContent = results.length + " match" + (results.length > 1 ? "es" : "");
    results.forEach(function (r) {
      var c = el("div", "result-card");
      c.innerHTML = '<div class="result-source">📄 ' + esc(r.name) + '</div><div class="result-snippet">' + r.snippet + '</div>';
      out.appendChild(c);
    });
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* ===================== Export ===================== */
  function downloadTxt(filename, content) {
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
    toast("Downloaded " + filename, "success");
  }

  function exportAllText() {
    if (!docs.length) { toast("No documents to export.", "error"); return; }
    var content = docs.map(function (d) {
      return "========================================\n" + d.name + " (" + fmtSize(d.size) + ")\n" +
        "Added: " + fmtDate(d.addedAt) + " | Words: " + wordCount(d.text) + "\n" +
        "========================================\n\n" + d.text;
    }).join("\n\n\n");
    downloadTxt("CampusAccess-AllDocuments.txt", content);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      var ta = el("textarea"); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  /* ===================== Text-to-Speech ===================== */
  var ttsUtter = null;
  function speak(text) {
    if (!("speechSynthesis" in window)) { toast("Text-to-speech not supported in this browser.", "error"); return; }
    window.speechSynthesis.cancel();
    var clean = stripHtml(text).slice(0, 32000);
    if (!clean.trim()) { toast("No text to read.", "error"); return; }
    ttsUtter = new SpeechSynthesisUtterance(clean);
    ttsUtter.rate = parseFloat($("#tts-rate").value) || 1;
    ttsUtter.onend = function () { setTtsStatus("Finished."); };
    ttsUtter.onerror = function (e) { setTtsStatus("Error: " + (e.error || "unknown")); };
    window.speechSynthesis.speak(ttsUtter);
    setTtsStatus("Reading…");
    $("#tts-text").value = clean.slice(0, 500) + (clean.length > 500 ? "…" : "");
  }
  function setTtsStatus(msg) { var s = $("#tts-status"); if (s) s.textContent = msg; }
  function ttsPause() { if (window.speechSynthesis) { window.speechSynthesis.pause(); setTtsStatus("Paused."); } }
  function ttsResume() { if (window.speechSynthesis) { window.speechSynthesis.resume(); setTtsStatus("Reading…"); } }
  function ttsStop() { if (window.speechSynthesis) { window.speechSynthesis.cancel(); setTtsStatus("Stopped."); } }

  /* ===================== Event wiring ===================== */
  function init() {
    load();
    loadPrefs();
    renderDashboard();
    populateResourceSources();
    $("#max-size-label").textContent = fmtSize(MAX_BYTES);

    // Navigation
    $all(".nav-link").forEach(function (n) {
      n.addEventListener("click", function () { showView(n.getAttribute("data-view")); });
    });
    $all("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.getAttribute("data-go");
        if (b.hasAttribute("data-doc")) $("#res-source").setAttribute("data-preselect", b.getAttribute("data-doc"));
        showView(v);
      });
    });

    // Mobile nav
    var menuBtn = $("#nav-menu-btn");
    menuBtn.addEventListener("click", function () {
      var nav = $(".main-nav");
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });

    // Panels
    $("#tts-toggle").addEventListener("click", function () { togglePanel("tts-panel", this); });
    $("#a11y-toggle").addEventListener("click", function () { togglePanel("a11y-panel", this); });

    // TTS controls
    $("#tts-play").addEventListener("click", function () {
      var t = $("#tts-text").value.trim();
      if (t) speak(t); else toast("Select or paste text to read aloud.", "error");
    });
    $("#tts-pause").addEventListener("click", ttsPause);
    $("#tts-resume").addEventListener("click", ttsResume);
    $("#tts-stop").addEventListener("click", ttsStop);
    $("#tts-rate").addEventListener("input", function () {
      $("#tts-rate-val").textContent = parseFloat(this.value).toFixed(1) + "×";
    });

    // Accessibility
    $all(".size-btn").forEach(function (b) { b.addEventListener("click", function () { setTextSize(b.getAttribute("data-size")); }); });
    $all(".theme-btn").forEach(function (b) { b.addEventListener("click", function () { setTheme(b.getAttribute("data-theme")); }); });
    $("#opt-dyslexia").addEventListener("change", function () { toggleClass("dyslexia", this.checked, "opt-dyslexia"); });
    $("#opt-linefocus").addEventListener("change", function () { toggleClass("linefocus", this.checked, "opt-linefocus"); });
    $("#opt-reduce-motion").addEventListener("change", function () { toggleClass("reduce-motion", this.checked, "opt-reduce-motion"); });
    $("#a11y-reset").addEventListener("click", function () {
      setTheme("light"); setTextSize("100");
      toggleClass("dyslexia", false, "opt-dyslexia");
      toggleClass("linefocus", false, "opt-linefocus");
      toggleClass("reduce-motion", false, "opt-reduce-motion");
      toast("Accessibility reset to defaults.");
    });

    // Upload: drag & drop
    var dz = $("#dropzone");
    dz.addEventListener("click", function () { $("#file-input").click(); });
    dz.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file-input").click(); } });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault(); dz.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });
    $("#browse-btn").addEventListener("click", function (e) { e.stopPropagation(); $("#file-input").click(); });
    $("#file-input").addEventListener("change", function () { handleFiles(this.files); this.value = ""; });

    // Resources
    $("#res-generate").addEventListener("click", generateResource);

    // Ask
    $("#ask-form").addEventListener("submit", function (e) {
      e.preventDefault();
      performSearch($("#ask-input").value, {
        whole: $("#ask-whole").checked,
        caseSensitive: $("#ask-case").checked
      });
    });

    // Library actions
    $("#export-all").addEventListener("click", exportAllText);
    $("#clear-all").addEventListener("click", clearAll);

    // Event delegation for doc items
    document.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-preview],[data-delete]") : null;
      if (t) {
        if (t.hasAttribute("data-preview")) openPreview(t.getAttribute("data-preview"));
        if (t.hasAttribute("data-delete")) deleteDoc(t.getAttribute("data-delete"));
      }
      if (e.target.closest("[data-close]")) closePreview();
    });

    // Selection → TTS text
    document.addEventListener("mouseup", function () {
      var sel = window.getSelection();
      var txt = sel ? sel.toString().trim() : "";
      if (txt.length > 2) { $("#tts-text").value = txt.slice(0, 5000); }
    });

    // ESC closes modal/panels
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closePreview();
        $("#tts-panel").hidden = true;
        $("#a11y-panel").hidden = true;
        closeMobileNav();
      }
    });
  }

  function togglePanel(id, btn) {
    var p = $("#" + id);
    var open = p.hidden;
    // Close other panel
    $("#tts-panel").hidden = true;
    $("#a11y-panel").hidden = true;
    p.hidden = !open;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
