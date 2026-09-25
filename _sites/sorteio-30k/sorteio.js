/* Sorteio — Festa 30K Josi Moretto
   Lê bilhetes.json (lista congelada), desenha a roleta com uma fatia por
   participante do tamanho dos bilhetes dela e sorteia um bilhete com
   crypto.getRandomValues. A posição do bilhete na roleta é a própria faixa
   de números, então o ponteiro para exatamente sobre o bilhete sorteado. */
(function () {
  "use strict";

  var MAX_SORTEIOS = 1;
  var CORES = ["#fc33a6", "#870a55", "#ff8dc8", "#e8590c", "#c40f7a"];
  var fmt = new Intl.NumberFormat("pt-BR");
  var pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var $ = function (id) { return document.getElementById(id); };

  var dados = null;          // conteúdo de bilhetes.json
  var estado = { sorteios: [], semRepetir: true };
  var chaveLocal = "";
  var rotacao = 0;
  var rodaMontadaCom = "";   // quem estava fora quando a roda foi desenhada
  var girando = false;

  /* ---------- guardar no aparelho (sobrevive a recarregar a página) ---------- */
  function salvar() {
    try { localStorage.setItem(chaveLocal, JSON.stringify(estado)); } catch (e) {}
  }
  function carregar() {
    try {
      var s = JSON.parse(localStorage.getItem(chaveLocal) || "null");
      if (s && Array.isArray(s.sorteios)) estado = s;
    } catch (e) {}
  }

  /* ---------- sorteio ---------- */
  // inteiro uniforme em [0, n), sem viés de módulo
  function aleatorio(n) {
    var limite = Math.floor(4294967296 / n) * n;
    var a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= limite);
    return a[0] % n;
  }

  function foraDoSorteio() {
    if (!estado.semRepetir) return {};
    var fora = {};
    estado.sorteios.forEach(function (s) { fora[s.instagram] = true; });
    return fora;
  }

  function naDisputa() {
    var fora = foraDoSorteio();
    return dados.participantes.filter(function (p) { return !fora[p.instagram]; });
  }

  function totalDe(lista) {
    return lista.reduce(function (t, p) { return t + p.bilhetes; }, 0);
  }

  /* ---------- roleta ---------- */
  function ponto(ang, r) {
    var a = (ang - 90) * Math.PI / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }

  function montarRoda() {
    var lista = naDisputa();
    var total = totalDe(lista);
    var svg = $("roda");
    var R = 100, html = "", acum = 0;

    lista.forEach(function (p, i) {
      var a0 = acum / total * 360, a1 = (acum + p.bilhetes) / total * 360;
      acum += p.bilhetes;
      var cor = CORES[i % CORES.length];
      if (lista.length === 1) {
        html += '<circle class="fatia" data-ig="' + esc(p.instagram) + '" r="' + R + '" fill="' + cor + '"/>';
      } else {
        var p0 = ponto(a0, R), p1 = ponto(a1, R), grande = a1 - a0 > 180 ? 1 : 0;
        html += '<path class="fatia" data-ig="' + esc(p.instagram) + '" fill="' + cor + '" d="M0 0 L' +
          p0[0].toFixed(3) + " " + p0[1].toFixed(3) + " A" + R + " " + R + " 0 " + grande + " 1 " +
          p1[0].toFixed(3) + " " + p1[1].toFixed(3) + ' Z"/>';
      }
      // nome só nas fatias com espaço para ele
      if (p.bilhetes / total >= 0.035) {
        var meio = (a0 + a1) / 2, c = ponto(meio, 71);
        var giro = meio > 180 ? meio + 90 : meio - 90;
        var nome = "@" + (p.instagram.length > 15 ? p.instagram.slice(0, 14) + "…" : p.instagram);
        html += '<text class="rotulo" text-anchor="middle" dominant-baseline="middle" transform="translate(' +
          c[0].toFixed(2) + " " + c[1].toFixed(2) + ") rotate(" + giro.toFixed(2) + ')">' + esc(nome) + "</text>";
      }
    });
    html += '<circle class="aro" r="' + R + '"/>';
    svg.innerHTML = html;

    // roda nova começa parada no zero, sem animação
    svg.classList.remove("girando");
    svg.style.transform = "rotate(0deg)";
    void svg.getBoundingClientRect();
    rotacao = 0;
    rodaMontadaCom = Object.keys(foraDoSorteio()).join("|");
  }

  function marcarGanhadora(ig) {
    var fatias = $("roda").querySelectorAll(".fatia");
    for (var i = 0; i < fatias.length; i++) fatias[i].classList.toggle("ganhou", fatias[i].getAttribute("data-ig") === ig);
  }

  /* ---------- visor: número rolando enquanto a roda gira ---------- */
  var rolando = 0;
  function rolarNumero(de, ate) {
    var alvo = $("numero"), ultimo = 0;
    cancelAnimationFrame(rolando);
    (function quadro(t) {
      if (t - ultimo > 70) { alvo.textContent = fmt.format(de + aleatorio(ate - de + 1)); ultimo = t; }
      rolando = requestAnimationFrame(quadro);
    })(0);
  }

  function sortear() {
    if (girando || estado.sorteios.length >= MAX_SORTEIOS) return;
    if (Object.keys(foraDoSorteio()).join("|") !== rodaMontadaCom) montarRoda();

    var lista = naDisputa();
    var total = totalDe(lista);
    if (!total) return;

    // sorteia a posição e acha a dona do bilhete
    var r = aleatorio(total), acum = 0, dona = null, bilhete = 0;
    for (var i = 0; i < lista.length; i++) {
      if (r < acum + lista[i].bilhetes) { dona = lista[i]; bilhete = dona.de + (r - acum); break; }
      acum += lista[i].bilhetes;
    }

    var resultado = {
      ordem: estado.sorteios.length + 1,
      bilhete: bilhete,
      instagram: dona.instagram,
      bilhetesDela: dona.bilhetes,
      emDisputa: total,
      chance: dona.bilhetes / total,
      quando: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    };
    // grava antes de animar: recarregar a página no meio do giro não refaz o sorteio
    estado.sorteios.push(resultado);
    salvar();

    // ponteiro fica no topo; gira até o centro do bilhete sorteado ficar embaixo dele
    var angulo = (r + 0.5) / total * 360;
    var voltas = matchMedia("(prefers-reduced-motion: reduce)").matches ? 2 : 8;
    var falta = ((360 - angulo - (rotacao % 360)) % 360 + 360) % 360;
    rotacao += voltas * 360 + falta;

    girando = true;
    atualizarBotoes();
    marcarGanhadora(null);
    $("visor-dona").textContent = "Girando…";
    $("chance").textContent = "";
    rolarNumero(dados.participantes[0].de, dados.total_bilhetes);

    var svg = $("roda");
    svg.classList.add("girando");
    svg.style.transform = "rotate(" + rotacao + "deg)";

    var feito = false;
    function revelar() {
      if (feito) return;
      feito = true;
      cancelAnimationFrame(rolando);
      girando = false;
      mostrarResultado(resultado);
      marcarGanhadora(resultado.instagram);
      render();
    }
    svg.addEventListener("transitionend", revelar, { once: true });
    setTimeout(revelar, voltas === 2 ? 1600 : 7600);
  }

  function mostrarResultado(s) {
    $("numero").textContent = fmt.format(s.bilhete);
    $("visor-dona").textContent = "@" + s.instagram;
    $("chance").textContent = "tinha " + fmt.format(s.bilhetesDela) + " de " + fmt.format(s.emDisputa) + " bilhetes (" + pct.format(s.chance) + ")";
    var v = $("visor");
    v.classList.remove("revelado");
    void v.offsetWidth;
    v.classList.add("revelado");
  }

  /* ---------- tela ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  function atualizarBotoes() {
    var feitos = estado.sorteios.length;
    var semGente = naDisputa().length === 0;
    $("sortear").disabled = girando || feitos >= MAX_SORTEIOS || semGente;
    $("sortear").textContent = feitos >= MAX_SORTEIOS ? "Sorteio feito" : "Sortear";
    $("copiar").disabled = girando || !feitos;
    $("desfazer").disabled = girando || !feitos;
  }

  function render() {
    var feitos = estado.sorteios.length;
    $("k-sorteios").textContent = feitos >= MAX_SORTEIOS ? "Feito" : "Pendente";
    $("k-restam").textContent = "1 ganhadora";

    // resultado
    var ata = $("ata");
    if (!feitos) {
      ata.innerHTML = '<li class="vazio">Nenhum sorteio feito ainda.</li>';
    } else {
      // o que ainda está girando não aparece antes da hora
      var mostrar = girando ? estado.sorteios.slice(0, -1) : estado.sorteios;
      ata.innerHTML = mostrar.map(function (s) {
        return '<li><span class="ordem">' + s.ordem + 'º</span><span><span class="quem">@' + esc(s.instagram) +
          '</span><br><span class="det">' + esc(s.quando) + " · " + pct.format(s.chance) + " de chance</span></span>" +
          '<span class="bil">nº ' + fmt.format(s.bilhete) + "<small>faixa dela: " + fmt.format(s.bilhetesDela) + " bilhetes</small></span></li>";
      }).join("") || '<li class="vazio">Sorteando…</li>';
    }

    // lista: enquanto gira, vale o estado de antes do sorteio em andamento
    var revelados = girando ? estado.sorteios.slice(0, -1) : estado.sorteios;
    var ganhou = {};
    revelados.forEach(function (s) { ganhou[s.instagram] = true; });
    var fora = estado.semRepetir ? ganhou : {};
    var total = totalDe(dados.participantes.filter(function (p) { return !fora[p.instagram]; }));
    var busca = $("busca").value.trim().toLowerCase().replace(/^@/, "");
    var linhas = dados.participantes.slice().sort(function (a, b) { return b.bilhetes - a.bilhetes || a.de - b.de; })
      .filter(function (p) { return !busca || p.instagram.toLowerCase().indexOf(busca) >= 0; })
      .map(function (p) {
        var faixa = p.de === p.ate ? fmt.format(p.de) : fmt.format(p.de) + " a " + fmt.format(p.ate);
        var chance = fora[p.instagram] ? "—" : pct.format(p.bilhetes / total);
        return '<tr class="' + (ganhou[p.instagram] ? "ganhou" : "") + '"><td>@' + esc(p.instagram) + '</td><td class="num">' +
          fmt.format(p.bilhetes) + '</td><td class="num">' + faixa + '</td><td class="num">' + chance + "</td></tr>";
      });
    $("lista").innerHTML = linhas.join("") || '<tr><td colspan="4">Ninguém com esse @.</td></tr>';

    atualizarBotoes();
  }

  function textoAta() {
    var linhas = [
      "Sorteio Festa 30K Josi Moretto",
      "Influenciadora campeã: " + dados.influenciadora + " (" + dados.cupom + "), " + fmt.format(dados.total_bilhetes) + " bilhetes",
      "Contagem fechada em " + dados.corte,
      "",
    ];
    estado.sorteios.forEach(function (s) {
      linhas.push("Ganhadora: @" + s.instagram + " (bilhete nº " + fmt.format(s.bilhete) + ", " + pct.format(s.chance) + " de chance) em " + s.quando);
    });
    linhas.push("", "Lista (SHA-256): " + dados.sha256, location.href.split("#")[0]);
    return linhas.join("\n");
  }

  function copiar() {
    var texto = textoAta(), botao = $("copiar");
    function ok() { botao.textContent = "Copiado"; setTimeout(function () { botao.textContent = "Copiar resultado"; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, reserva);
    } else reserva();
    function reserva() {
      var t = document.createElement("textarea");
      t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); ok(); } catch (e) {}
      t.remove();
    }
  }

  // desfazer e recomeçar pedem dois cliques (sem janela de confirmação do navegador)
  function doisCliques(id, rotulo, acao) {
    var b = $(id), espera = 0;
    b.addEventListener("click", function () {
      if (!b.classList.contains("armado")) {
        b.classList.add("armado");
        b.textContent = "Clique de novo para confirmar";
        espera = setTimeout(function () { b.classList.remove("armado"); b.textContent = rotulo; }, 4000);
        return;
      }
      clearTimeout(espera);
      b.classList.remove("armado");
      b.textContent = rotulo;
      acao();
      aposCorrecao();
    });
  }

  function aposCorrecao() {
    salvar();
    montarRoda();
    var ultimo = estado.sorteios[estado.sorteios.length - 1];
    if (ultimo) {
      mostrarResultado(ultimo);
      marcarGanhadora(ultimo.instagram);
    } else {
      $("numero").textContent = "—";
      $("visor-dona").textContent = "Clique em sortear";
      $("chance").textContent = "";
    }
    render();
  }

  /* ---------- conferência da lista ---------- */
  function conferirHash(texto) {
    var obj = JSON.parse(texto);
    var esperado = obj.sha256;
    delete obj.sha256;
    if (!window.crypto || !crypto.subtle) return;
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(obj))).then(function (buf) {
      var hex = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      $("hash-ok").textContent = hex === esperado ? "✓ confere" : "✗ não confere";
    });
  }

  /* ---------- início ---------- */
  function iniciar(texto) {
    dados = JSON.parse(texto);
    chaveLocal = "sorteio30k:1:" + dados.sha256;
    carregar();

    $("sub").textContent = "Contagem fechada em " + dados.corte + ". Cada interação com o cupom da campeã vale 1 bilhete: quem interagiu mais tem mais chance.";
    $("k-influ").textContent = dados.influenciadora;
    $("k-cupom").textContent = dados.cupom;
    $("k-bilhetes").textContent = fmt.format(dados.total_bilhetes);
    $("k-pessoas").textContent = fmt.format(dados.participantes.length);
    $("regra").textContent = dados.regra;
    $("hash").textContent = dados.sha256;
    conferirHash(texto);

    montarRoda();
    var ultimo = estado.sorteios[estado.sorteios.length - 1];
    if (ultimo) {
      mostrarResultado(ultimo);
      // com "sem repetir" a última ganhadora já saiu da roda; só pinta se ela ainda estiver lá
      marcarGanhadora(ultimo.instagram);
    }
    render();

    $("sortear").addEventListener("click", sortear);
    $("copiar").addEventListener("click", copiar);
    doisCliques("desfazer", "Desfazer sorteio", function () { estado.sorteios.pop(); });
    $("busca").addEventListener("input", render);
  }

  fetch("./bilhetes.json?v=20260925c", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(iniciar)
    .catch(function () { $("sub").textContent = "Não foi possível carregar a lista de bilhetes. Recarregue a página."; });
})();
