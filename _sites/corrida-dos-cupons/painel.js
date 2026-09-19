/* =====================================================================
   Corrida dos Cupons — painel público
   Dados: GET /webhook/painel-cupons no n8n (lê a planilha da campanha).
   A planilha é a fonte de verdade; esta página só desenha.

   Regras de gráfico seguidas aqui:
   - uma escala por eixo, nunca dois eixos y;
   - cor categórica em ordem fixa (rosa, laranja, verde), nunca ciclada;
   - magnitude num mapa de calor usa UMA cor, claro -> escuro;
   - legenda sempre que há 2+ séries; tabela disponível para o ranking;
   - texto usa cor de texto, nunca a cor da série.
   ===================================================================== */
(function () {
  "use strict";

  var ENDPOINT = "https://n8n.automizelabs.com.br/webhook/painel-cupons";
  var INTERVALO = 60; // segundos entre atualizações automáticas

  var $ = function (id) { return document.getElementById(id); };
  var menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var css = getComputedStyle(document.documentElement);
  var T = {};
  ["ground","surface","surface-2","surface-3","ink","ink-2","ink-3","line","line-2",
   "c1","c2","c3","r0","r1","r2","r3","r4","r5"].forEach(function (k) {
    T[k] = css.getPropertyValue("--" + k).trim();
  });

  var FONTE = "Figtree, system-ui, sans-serif";

  // a maior parte do acesso é no celular: alguns gráficos mudam de forma,
  // não só de tamanho, abaixo desta largura
  var LARGURA_CELULAR = 720;
  function ehCelular() { return window.innerWidth <= LARGURA_CELULAR; }

  /* ----------------------------------------------------------- formatação */
  var nf = new Intl.NumberFormat("pt-BR");
  var n = function (v) { return nf.format(Math.round(v || 0)); };
  var dec = function (v, d) {
    return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  var pct = function (p) { return dec((p || 0) * 100, 1) + "%"; };
  var diaCurto = function (d) { return d ? d.slice(8) + "/" + d.slice(5, 7) : ""; };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /* ---------------------------------------------------------------- estado */
  var D = null;
  var filtro = { codigo: null, dia: null, periodo: "tudo", busca: "" };
  var topN = 10;
  var graficos = {};
  var valoresAnteriores = {};
  var restante = INTERVALO;

  /* =================================================== busca dos dados === */
  function status(estado, texto) {
    var el = $("live");
    el.className = "live" + (estado ? " " + estado : "");
    $("liveTexto").textContent = texto;
  }

  function buscar(manual) {
    status("carregando", manual ? "atualizando…" : "buscando dados…");
    return fetch(ENDPOINT, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (novo) {
        D = novo;
        restante = INTERVALO;
        status("", "ao vivo");
        montarControles();
        desenhar();
      })
      .catch(function (e) {
        status("erro", "sem conexão — tentando de novo");
        if (!D) {
          $("stats").innerHTML =
            '<p class="vazio">Não consegui carregar os dados agora. A página tenta de novo sozinha.</p>';
        }
        console.error("[painel]", e);
      });
  }

  /* ======================================================== filtragem === */
  function todosOsDias() {
    var s = {};
    (D.interacoes || []).forEach(function (i) { s[i.dia] = 1; });
    return Object.keys(s).sort();
  }

  function aplicar() {
    var dias = todosOsDias();
    var corte = null;
    if (filtro.periodo !== "tudo" && dias.length) {
      corte = dias[Math.max(0, dias.length - Number(filtro.periodo))];
    }
    var b = filtro.busca.trim().toLowerCase();

    return (D.interacoes || []).filter(function (i) {
      if (filtro.codigo && i.codigo !== filtro.codigo) return false;
      if (filtro.dia && i.dia !== filtro.dia) return false;
      if (corte && i.dia < corte) return false;
      if (b && (i.nome + " " + i.instagram + " " + i.codigo + " " + i.influenciadora).toLowerCase().indexOf(b) < 0) return false;
      return true;
    });
  }

  function agrupar(linhas) {
    var porCupom = {}, porPessoa = {}, porDia = {}, heat = {};

    linhas.forEach(function (i) {
      var c = porCupom[i.codigo] || (porCupom[i.codigo] = { n: 0, pessoas: {} });
      c.n++; c.pessoas[i.pessoa] = 1;

      var p = porPessoa[i.pessoa] || (porPessoa[i.pessoa] = {
        pessoa: i.pessoa, nome: i.nome, instagram: i.instagram, n: 0, cupons: {}, primeiroDia: i.dia
      });
      p.n++; p.cupons[i.codigo] = 1;
      if (i.dia < p.primeiroDia) p.primeiroDia = i.dia;
      if (!p.nome && i.nome) p.nome = i.nome;
      if (!p.instagram && i.instagram) p.instagram = i.instagram;

      var d = porDia[i.dia] || (porDia[i.dia] = { dia: i.dia, n: 0, pessoas: {} });
      d.n++; d.pessoas[i.pessoa] = 1;

      heat[i.dia + "|" + i.hora] = (heat[i.dia + "|" + i.hora] || 0) + 1;
    });

    var pessoas = Object.keys(porPessoa).map(function (k) {
      var p = porPessoa[k];
      p.nCupons = Object.keys(p.cupons).length;
      return p;
    }).sort(function (a, b) { return b.n - a.n || String(a.nome).localeCompare(String(b.nome), "pt-BR"); });

    var dias = Object.keys(porDia).sort().map(function (k) {
      var d = porDia[k];
      var novas = pessoas.filter(function (p) { return p.primeiroDia === k; }).length;
      var únicas = Object.keys(d.pessoas).length;
      return { dia: k, n: d.n, pessoas: únicas, novas: novas, recorrentes: Math.max(0, únicas - novas) };
    });

    var cupons = (D.cupons || []).map(function (c) {
      var g = porCupom[c.codigo];
      var qtd = g ? g.n : 0;
      var pes = g ? Object.keys(g.pessoas).length : 0;
      return {
        codigo: c.codigo,
        influenciadora: c.influenciadora || c.codigo,
        seguidores: c.seguidores || 0,
        n: qtd,
        pessoas: pes,
        por1k: c.seguidores ? (qtd / c.seguidores) * 1000 : 0
      };
    }).sort(function (a, b) { return b.n - a.n || a.influenciadora.localeCompare(b.influenciadora, "pt-BR"); });

    return { linhas: linhas, cupons: cupons, pessoas: pessoas, dias: dias, heat: heat };
  }

  /* ================================================= filtros: interação == */
  function alternar(campo, valor) {
    filtro[campo] = filtro[campo] === valor ? null : valor;
    sincronizar();
    desenhar();
  }

  function sincronizar() {
    $("fInflu").value = filtro.codigo || "";
    $("fPeriodo").value = filtro.periodo;
  }

  function montarControles() {
    var sel = $("fInflu");
    if (sel.options.length <= 1 || sel.dataset.qtd !== String((D.cupons || []).length)) {
      var ordenados = (D.cupons || []).slice().sort(function (a, b) {
        return String(a.influenciadora).localeCompare(String(b.influenciadora), "pt-BR");
      });
      sel.innerHTML = '<option value="">Todas</option>' + ordenados.map(function (c) {
        return '<option value="' + esc(c.codigo) + '">' + esc(c.influenciadora) + " (" + esc(c.codigo) + ")</option>";
      }).join("");
      sel.dataset.qtd = String((D.cupons || []).length);
    }

    var qtdDias = todosOsDias().length;
    var ops = [["tudo", "Todo o período"]];
    if (qtdDias > 1) ops.push(["1", "Último dia"]);
    if (qtdDias > 3) ops.push(["3", "Últimos 3 dias"]);
    if (qtdDias > 7) ops.push(["7", "Últimos 7 dias"]);
    var per = $("fPeriodo");
    if (per.options.length !== ops.length) {
      per.innerHTML = ops.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("");
    }
    sincronizar();
  }

  function chips() {
    var ativos = [];
    if (filtro.codigo) {
      var c = (D.cupons || []).find(function (x) { return x.codigo === filtro.codigo; });
      ativos.push(["codigo", (c ? c.influenciadora : filtro.codigo)]);
    }
    if (filtro.dia) ativos.push(["dia", diaCurto(filtro.dia)]);
    if (filtro.periodo !== "tudo") ativos.push(["periodo", "últimos " + filtro.periodo + "d"]);
    if (filtro.busca.trim()) ativos.push(["busca", '"' + filtro.busca.trim() + '"']);

    $("chipsAtivos").innerHTML = ativos.map(function (a) {
      return '<button class="fchip" type="button" data-limpar="' + a[0] + '">' + esc(a[1]) + " <span>×</span></button>";
    }).join("");

    Array.prototype.forEach.call($("chipsAtivos").querySelectorAll("[data-limpar]"), function (el) {
      el.addEventListener("click", function () {
        var k = el.getAttribute("data-limpar");
        if (k === "codigo") filtro.codigo = null;
        if (k === "dia") filtro.dia = null;
        if (k === "periodo") filtro.periodo = "tudo";
        if (k === "busca") { filtro.busca = ""; $("fBusca").value = ""; }
        sincronizar();
        desenhar();
      });
    });
  }

  /* ================================================ base comum dos eixos = */
  function eixoCat(dados, rotulo) {
    return {
      type: "category",
      data: dados,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: T["ink-3"], fontFamily: FONTE, fontSize: 12, fontWeight: 600,
        formatter: rotulo || null, hideOverlap: true
      }
    };
  }

  function eixoVal(nome) {
    return {
      type: "value",
      name: nome || "",
      nameTextStyle: { color: T["ink-3"], fontFamily: FONTE, fontSize: 11.5, fontWeight: 600, padding: [0, 0, 6, 0] },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: T.line } },
      axisLabel: { color: T["ink-3"], fontFamily: FONTE, fontSize: 12, fontWeight: 600, formatter: function (v) { return n(v); } }
    };
  }

  var TOOLTIP = {
    backgroundColor: T.ink,
    borderWidth: 0,
    padding: [8, 11],
    textStyle: { color: T.ground, fontFamily: FONTE, fontSize: 13, fontWeight: 600, lineHeight: 19 },
    extraCssText: "border-radius:8px;box-shadow:0 8px 24px -12px rgba(29,15,24,.5)"
  };

  function grafico(id) {
    if (!graficos[id]) {
      graficos[id] = echarts.init($(id), null, { renderer: "canvas" });
    }
    return graficos[id];
  }

  function pintar(id, opcao, aoClicar) {
    var g = grafico(id);
    g.setOption(opcao, { notMerge: true, lazyUpdate: false });
    g.off("click");
    if (aoClicar) g.on("click", aoClicar);
  }

  /* ====================================================== desenho geral == */
  function desenhar() {
    if (!D) return;
    var linhas = aplicar();
    var m = agrupar(linhas);

    chips();
    placar(linhas, m);
    ranking(m);
    ritmoDias(m);
    ritmoPessoas(m);
    mapaDeCalor(m);
    conversao(m);
    tabelaSeguidoras(m);
    carimbo();
  }

  /* ---------------------------------------------------------- placar ---- */
  function placar(linhas, m) {
    var comDados = m.cupons.filter(function (c) { return c.n > 0; });
    var total = linhas.length;
    var pessoas = m.pessoas.length;
    var top5 = comDados.slice(0, 5).reduce(function (s, c) { return s + c.n; }, 0);

    var cartoes = [
      { rot: "Interações", val: total, acento: T.c1 },
      { rot: "Participantes", val: pessoas, unidade: "pessoas", acento: T.c1 },
      { rot: "Divulgando", val: comDados.length, unidade: "de " + n(m.cupons.length), acento: T.c3 },
      { rot: "Por pessoa", val: pessoas ? total / pessoas : 0, casas: 1, unidade: "em média", acento: T.c3 },
      { rot: "Top 5 concentra", texto: total ? pct(top5 / total) : "—", acento: T.c2 },
      { rot: "Dias no ar", val: m.dias.length, unidade: "com movimento", acento: T.c2 }
    ];

    var alvo = $("stats");
    if (alvo.children.length !== cartoes.length) {
      alvo.innerHTML = cartoes.map(function (c, i) {
        return '<div class="stat" style="--acento:' + c.acento + '">' +
          "<dt>" + esc(c.rot) + "</dt>" +
          '<dd><span data-num="' + i + '">0</span>' +
          (c.unidade ? '<span class="unit">' + esc(c.unidade) + "</span>" : "") +
          "</dd></div>";
      }).join("");
      if (!menosMovimento && window.gsap) {
        gsap.from(alvo.children, { y: 14, opacity: 0, duration: .5, stagger: .05, ease: "power2.out" });
      }
    } else {
      // só o rótulo da unidade pode mudar (ex.: "de 42")
      cartoes.forEach(function (c, i) {
        var u = alvo.children[i].querySelector(".unit");
        if (u && c.unidade) u.textContent = c.unidade;
      });
    }

    cartoes.forEach(function (c, i) {
      var el = alvo.querySelector('[data-num="' + i + '"]');
      if (!el) return;
      if (c.texto != null) { el.textContent = c.texto; return; }
      animarNumero(el, "stat" + i, c.val, c.casas || 0);
    });
  }

  function animarNumero(el, chave, valor, casas) {
    var de = valoresAnteriores[chave] || 0;
    valoresAnteriores[chave] = valor;
    // aba em segundo plano: o rAF fica lento e o número congelaria no meio
    if (menosMovimento || document.hidden || !window.gsap || de === valor) {
      el.textContent = casas ? dec(valor, casas) : n(valor);
      return;
    }
    var obj = { v: de };
    gsap.to(obj, {
      v: valor, duration: .9, ease: "power2.out",
      onUpdate: function () { el.textContent = casas ? dec(obj.v, casas) : n(obj.v); }
    });
  }

  /* --------------------------------------------------------- ranking ---- */
  function ranking(m) {
    var lista = topN ? m.cupons.slice(0, topN) : m.cupons;
    // barra horizontal: a maior em cima
    var nomes = lista.map(function (c) { return c.influenciadora; }).reverse();
    var valores = lista.map(function (c) {
      return { value: c.n, codigo: c.codigo, pessoas: c.pessoas, seguidores: c.seguidores };
    }).reverse();

    pintar("cRanking", {
      animationDuration: menosMovimento ? 0 : 600,
      grid: { left: 8, right: 64, top: 10, bottom: 8, containLabel: true },
      tooltip: Object.assign({ trigger: "item", formatter: function (p) {
        var d = p.data;
        return p.name + "<br/>" + n(d.value) + " interações · " + n(d.pessoas) +
          (d.pessoas === 1 ? " pessoa" : " pessoas") + "<br/>" + n(d.seguidores) + " seguidores";
      } }, TOOLTIP),
      xAxis: Object.assign(eixoVal(), { splitLine: { lineStyle: { color: T.line } } }),
      yAxis: Object.assign(eixoCat(nomes), {
        axisLabel: {
          color: T["ink-2"], fontFamily: FONTE,
          fontSize: ehCelular() ? 13 : 13.5, fontWeight: 600,
          width: ehCelular() ? 88 : 150, overflow: "truncate"
        }
      }),
      series: [{
        type: "bar",
        data: valores,
        barMaxWidth: 18,
        itemStyle: {
          color: function (p) { return (filtro.codigo && p.data.codigo !== filtro.codigo) ? T["surface-3"] : T.c1; },
          borderRadius: [0, 4, 4, 0]
        },
        emphasis: { itemStyle: { color: T.r4 } },
        label: {
          show: true, position: "right", distance: 8,
          color: T["ink-2"], fontFamily: FONTE, fontSize: 13, fontWeight: 800,
          formatter: function (p) { return p.value > 0 ? n(p.value) : ""; }
        }
      }]
    }, function (p) {
      if (p.data && p.data.codigo) alternar("codigo", p.data.codigo);
    });

    tabelaRanking(m.cupons);
  }

  // no celular as colunas secundárias somem (classe so-desktop) em vez de
  // empurrar a tabela para uma rolagem lateral que ninguém acha
  function tabelaRanking(cupons) {
    $("tRanking").innerHTML =
      "<thead><tr><th>#</th><th>Influenciadora</th><th class='so-desktop'>Cupom</th><th class='n'>Interações</th>" +
      "<th class='n so-desktop'>Pessoas</th><th class='n so-desktop'>Seguidores</th>" +
      "<th class='n'>Por mil seg.</th></tr></thead><tbody>" +
      cupons.map(function (c, i) {
        return "<tr><td class='pos'>" + (i + 1) + "</td><td>" + esc(c.influenciadora) +
          "<span class='codigo so-celular'>" + esc(c.codigo) + "</span></td>" +
          "<td class='codigo so-desktop'>" + esc(c.codigo) + "</td>" +
          "<td class='n'>" + n(c.n) + "</td><td class='n so-desktop'>" + n(c.pessoas) + "</td>" +
          "<td class='n so-desktop'>" + n(c.seguidores) + "</td>" +
          "<td class='n'>" + (c.seguidores ? dec(c.por1k, 2) : "—") + "</td></tr>";
      }).join("") + "</tbody>";
  }

  /* ----------------------------------------------------------- ritmo ---- */
  function ritmoDias(m) {
    var dias = m.dias;
    pintar("cDias", {
      animationDuration: menosMovimento ? 0 : 600,
      grid: { left: 8, right: 12, top: 16, bottom: dias.length > 8 ? 52 : 28, containLabel: true },
      tooltip: Object.assign({ trigger: "axis", axisPointer: { type: "shadow" }, formatter: function (ps) {
        var p = ps[0];
        return p.name + "<br/>" + n(p.value) + " interações";
      } }, TOOLTIP),
      xAxis: eixoCat(dias.map(function (d) { return d.dia; }), function (v) { return diaCurto(v); }),
      yAxis: eixoVal(),
      dataZoom: dias.length > 8 ? [{
        type: "slider", height: 18, bottom: 6,
        borderColor: "transparent", backgroundColor: T["surface-2"],
        fillerColor: "rgba(252,51,166,.12)",
        handleStyle: { color: T.c1, borderColor: T.c1 },
        moveHandleStyle: { color: T.c1 },
        dataBackground: { lineStyle: { color: T["line-2"] }, areaStyle: { color: T["surface-3"] } },
        selectedDataBackground: { lineStyle: { color: T.c1 }, areaStyle: { color: T.r1 } },
        textStyle: { color: T["ink-3"], fontFamily: FONTE, fontSize: 11.5, fontWeight: 600 }
      }] : [],
      series: [{
        type: "bar",
        data: dias.map(function (d) { return { value: d.n, dia: d.dia }; }),
        barMaxWidth: 34,
        itemStyle: {
          color: function (p) { return (filtro.dia && p.data.dia !== filtro.dia) ? T["surface-3"] : T.c1; },
          borderRadius: [4, 4, 0, 0]
        },
        emphasis: { itemStyle: { color: T.r4 } }
      }]
    }, function (p) {
      if (p.data && p.data.dia) alternar("dia", p.data.dia);
    });
  }

  function ritmoPessoas(m) {
    var dias = m.dias;
    // duas séries -> legenda obrigatória; 2px de respiro entre os blocos
    var borda = { borderColor: T.surface, borderWidth: 2 };
    pintar("cPessoas", {
      animationDuration: menosMovimento ? 0 : 600,
      grid: { left: 8, right: 12, top: 40, bottom: 20, containLabel: true },
      legend: {
        top: 0, left: 0, itemWidth: 10, itemHeight: 10, itemGap: 16,
        textStyle: { color: T["ink-2"], fontFamily: FONTE, fontSize: 12 }
      },
      tooltip: Object.assign({ trigger: "axis", axisPointer: { type: "shadow" } }, TOOLTIP),
      xAxis: eixoCat(dias.map(function (d) { return d.dia; }), function (v) { return diaCurto(v); }),
      yAxis: eixoVal(),
      series: [
        {
          name: "Novas", type: "bar", stack: "p",
          data: dias.map(function (d) { return d.novas; }),
          barMaxWidth: 34,
          itemStyle: Object.assign({ color: T.c1, borderRadius: [4, 4, 0, 0] }, borda)
        },
        {
          name: "Recorrentes", type: "bar", stack: "p",
          data: dias.map(function (d) { return d.recorrentes; }),
          barMaxWidth: 34,
          itemStyle: Object.assign({ color: T.c3 }, borda)
        }
      ]
    });
  }

  function mapaDeCalor(m) {
    var dias = m.dias.map(function (d) { return d.dia; });

    // 24 colunas num celular dão ~13px cada: vira listra sem rótulo legível.
    // Abaixo da largura de celular as horas entram em blocos de 3h — 8 colunas,
    // que cabem e continuam contando a mesma história (quando a campanha respira).
    var passo = ehCelular() ? 3 : 1;
    var blocos = [];
    for (var h = 0; h < 24; h += passo) {
      blocos.push({
        inicio: h,
        rotulo: passo === 1
          ? String(h).padStart(2, "0") + "h"
          : String(h).padStart(2, "0") + "–" + String(h + passo).padStart(2, "0") + "h"
      });
    }
    $("legendaHeat").textContent = passo === 1
      ? "A que horas a campanha respira. Clique numa célula para isolar aquele dia."
      : "A que horas a campanha respira, em blocos de 3 horas. Toque numa célula para isolar aquele dia.";

    var dados = [];
    var max = 0;
    dias.forEach(function (d, y) {
      blocos.forEach(function (b, x) {
        var v = 0;
        for (var k = 0; k < passo; k++) v += m.heat[d + "|" + (b.inicio + k)] || 0;
        if (v > max) max = v;
        dados.push([x, y, v]);
      });
    });
    var horas = blocos.map(function (b) { return b.rotulo; });

    pintar("cHeat", {
      animationDuration: menosMovimento ? 0 : 500,
      grid: { left: 8, right: 12, top: 10, bottom: 62, containLabel: true },
      tooltip: Object.assign({ formatter: function (p) {
        return dias[p.value[1]] + " · " + horas[p.value[0]] + "<br/>" +
          n(p.value[2]) + (p.value[2] === 1 ? " interação" : " interações");
      } }, TOOLTIP),
      xAxis: Object.assign(eixoCat(horas), { splitArea: { show: false } }),
      yAxis: Object.assign(eixoCat(dias.map(diaCurto)), { inverse: true }),
      visualMap: {
        min: 0, max: Math.max(1, max),
        calculable: true, orient: "horizontal", left: "center", bottom: 8,
        itemWidth: 12, itemHeight: 120,
        textStyle: { color: T["ink-3"], fontFamily: FONTE, fontSize: 12, fontWeight: 600 },
        // magnitude = uma cor só, claro -> escuro
        inRange: { color: [T.r0, T.r1, T.r2, T.r3, T.r4, T.r5] }
      },
      series: [{
        type: "heatmap",
        data: dados,
        itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 2 } },
        progressive: 0
      }]
    }, function (p) {
      if (p.value) alternar("dia", dias[p.value[1]]);
    });
  }

  /* ------------------------------------------------------- conversão ---- */
  function faixa(seg) {
    if (seg < 20000) return 0;
    if (seg < 60000) return 1;
    return 2;
  }
  var FAIXAS = ["Até 20 mil seguidores", "De 20 a 60 mil", "Acima de 60 mil"];

  function conversao(m) {
    var ativos = m.cupons.filter(function (c) { return c.n > 0 && c.seguidores > 0; });
    var totalInt = ativos.reduce(function (s, c) { return s + c.n; }, 0);
    var totalSeg = ativos.reduce(function (s, c) { return s + c.seguidores; }, 0);
    var media = totalSeg ? (totalInt / totalSeg) * 1000 : 0;

    var maxN = ativos.reduce(function (x, c) { return Math.max(x, c.n); }, 1);
    var cores = [T.c1, T.c2, T.c3];

    var series = FAIXAS.map(function (nome, idx) {
      var doGrupo = ativos.filter(function (c) { return faixa(c.seguidores) === idx; });
      return {
        name: nome,
        type: "scatter",
        data: doGrupo.map(function (c) {
          return { value: [c.seguidores, c.por1k], nome: c.influenciadora, codigo: c.codigo, n: c.n, pessoas: c.pessoas };
        }),
        symbolSize: function (val, p) {
          return 10 + Math.sqrt(p.data.n / maxN) * 28; // área ~ interações
        },
        itemStyle: {
          color: cores[idx],
          opacity: .85,
          borderColor: T.surface, // anel de 2px onde as bolhas se sobrepõem
          borderWidth: 2
        },
        emphasis: { itemStyle: { opacity: 1, borderColor: T.ink } },
        // rótulo direto só em quem se destaca — nunca um número em cada ponto
        label: {
          show: true,
          position: "top",
          distance: 8,
          color: T["ink-2"],
          fontFamily: FONTE,
          fontSize: 11.5,
          fontWeight: 600,
          formatter: function (p) { return p.data.por1kTop ? p.data.nome : ""; }
        }
      };
    });

    // rótulo direto só em quem se destaca; no celular sobra espaço para um só
    ativos.slice().sort(function (a, b) { return b.por1k - a.por1k; })
      .slice(0, ehCelular() ? 1 : 3).forEach(function (c) {
      series.forEach(function (s) {
        s.data.forEach(function (d) { if (d.codigo === c.codigo) d.por1kTop = true; });
      });
    });

    pintar("cConv", {
      animationDuration: menosMovimento ? 0 : 700,
      // top generoso: a legenda fica na linha de cima e o nome do eixo y
      // logo abaixo dela, sem os dois se encavalarem
      grid: { left: 10, right: 24, top: ehCelular() ? 66 : 74, bottom: 46, containLabel: true },
      legend: {
        top: 0, left: 0, itemWidth: 10, itemHeight: 10, itemGap: 18,
        textStyle: { color: T["ink-2"], fontFamily: FONTE, fontSize: 12 }
      },
      tooltip: Object.assign({ trigger: "item", formatter: function (p) {
        var d = p.data;
        return d.nome + "<br/>" + dec(d.value[1], 2) + " por mil seguidores<br/>" +
          n(d.n) + " interações · " + n(d.value[0]) + " seguidores";
      } }, TOOLTIP),
      xAxis: {
        // no canto direito o rótulo do eixo era cortado pela borda do grid
        type: "log", logBase: 10, name: "seguidores",
        nameLocation: "middle", nameGap: 30,
        nameTextStyle: { color: T["ink-3"], fontFamily: FONTE, fontSize: 11.5, fontWeight: 600 },
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: T.line } },
        axisLabel: {
          color: T["ink-3"], fontFamily: FONTE, fontSize: 12, fontWeight: 600,
          formatter: function (v) { return v >= 1000000 ? (v / 1000000) + "M" : v >= 1000 ? (v / 1000) + "k" : v; }
        }
      },
      // no celular a legenda quebra em duas linhas e o nome do eixo bate nela;
      // a explicação já está no texto da seção, então some com o nome
      yAxis: eixoVal(ehCelular() ? "" : "interações por mil seguidores"),
      series: series.concat([{
        name: "Média da campanha",
        type: "line",
        data: [],
        symbol: "none",
        // sem cor explícita o ECharts pega a própria paleta e entra uma 4ª cor
        // que não é da campanha; a referência é cinza de linha, não série
        lineStyle: { color: T["line-2"], type: "dashed", width: 2 },
        itemStyle: { color: T["line-2"] },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            formatter: "média da campanha · " + dec(media, 2),
            color: T["ink-3"], fontFamily: FONTE, fontSize: 12, fontWeight: 600,
            position: "insideEndTop"
          },
          lineStyle: { color: T["line-2"], type: "dashed", width: 2 },
          data: [{ yAxis: media }]
        }
      }])
    }, function (p) {
      if (p.data && p.data.codigo) alternar("codigo", p.data.codigo);
    });
  }

  /* ------------------------------------------------------ seguidoras ---- */
  function tabelaSeguidoras(m) {
    var LIM = 15;
    var lista = m.pessoas.slice(0, LIM);
    var medalhas = ["🥇", "🥈", "🥉"];

    $("tSeguidoras").innerHTML =
      "<thead><tr><th>#</th><th>Quem</th><th class='n'>Interações</th><th class='n'>Cupons</th></tr></thead><tbody>" +
      (lista.length ? lista.map(function (p, i) {
        return "<tr><td class='codigo'>" + (medalhas[i] ? '<span class="medalha">' + medalhas[i] + "</span>" : i + 1) + "</td>" +
          "<td>" + esc(p.nome || "—") +
          (p.instagram ? '<br><span class="ig">@' + esc(p.instagram) + "</span>" : "") + "</td>" +
          "<td class='n'>" + n(p.n) + "</td><td class='n'>" + n(p.nCupons) + "</td></tr>";
      }).join("") : "<tr><td colspan='4' class='vazio'>Nenhuma participação no filtro atual.</td></tr>") +
      "</tbody>";

    $("notaSeg").textContent = m.pessoas.length > LIM
      ? "Mostrando as " + LIM + " primeiras de " + n(m.pessoas.length) + " participantes."
      : "";
  }

  /* ---------------------------------------------------------- carimbo --- */
  function carimbo() {
    var bits = [];
    var dias = todosOsDias();
    if (dias.length) bits.push("Campanha de " + diaCurto(dias[0]) + " a " + diaCurto(dias[dias.length - 1]));
    if (D.geradoEm) {
      var g = new Date(D.geradoEm);
      bits.push("Dados de " + g.toLocaleDateString("pt-BR") + " às " +
        g.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    if (D.conferencia) bits.push(n(D.conferencia.interacoes) + " interações no total");
    $("meta").innerHTML = bits.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
  }

  /* ======================================================== arranque ==== */
  $("fInflu").addEventListener("change", function () { filtro.codigo = this.value || null; desenhar(); });
  $("fPeriodo").addEventListener("change", function () { filtro.periodo = this.value; desenhar(); });

  var debounce;
  $("fBusca").addEventListener("input", function () {
    var v = this.value;
    clearTimeout(debounce);
    debounce = setTimeout(function () { filtro.busca = v; desenhar(); }, 220);
  });

  Array.prototype.forEach.call(document.querySelectorAll(".segmented button"), function (b) {
    b.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".segmented button"), function (x) { x.classList.remove("on"); });
      b.classList.add("on");
      topN = Number(b.dataset.top);
      desenhar();
    });
  });

  $("btnAtualizar").addEventListener("click", function () { buscar(true); });

  // relógio da atualização automática
  setInterval(function () {
    restante--;
    if (restante <= 0) { buscar(false); restante = INTERVALO; }
    $("conta").textContent = "(" + Math.max(0, restante) + "s)";
  }, 1000);

  // a aba voltou ao foco: mostra dado fresco em vez de esperar o relógio
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && restante < INTERVALO - 10) buscar(false);
  });

  // girar o celular ou mudar de faixa não é só redimensionar: o mapa de calor
  // troca de granularidade e o ranking de largura de rótulo, então redesenha
  var eraCelular = ehCelular();
  var aoRedimensionar;
  window.addEventListener("resize", function () {
    Object.keys(graficos).forEach(function (k) { graficos[k].resize(); });
    clearTimeout(aoRedimensionar);
    aoRedimensionar = setTimeout(function () {
      if (ehCelular() !== eraCelular) {
        eraCelular = ehCelular();
        desenhar();
      }
    }, 200);
  });

  // barra de progresso do scroll
  window.addEventListener("scroll", function () {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    $("progresso").style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
  }, { passive: true });

  // scroll suave — mesma camada de movimento da landing da AutomizeLabs
  if (!menosMovimento && window.Lenis) {
    var lenis = new Lenis({ duration: 1.05, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
  }

  buscar(false);
})();
