// Funções usadas pelas duas páginas (votação e administração).
(function () {
  "use strict";

  const cfg = window.ENQUETE_CONFIG || {};
  const url = String(cfg.supabaseUrl || "");
  const chave = String(cfg.supabaseKey || "");
  const configurado =
    /^https:\/\/[^/]+/.test(url) && !url.includes("SEU-PROJETO") &&
    chave.length > 20 && !chave.includes("SUA-CHAVE");

  const cliente = configurado && window.supabase
    ? window.supabase.createClient(url, chave)
    : null;

  const semMovimento = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Cria um elemento. Texto sempre entra como texto (nunca como HTML).
  function el(tag, attrs, ...filhos) {
    const no = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") no.className = v;
      else if (k === "text") no.textContent = v;
      else if (k.startsWith("on")) no.addEventListener(k.slice(2), v);
      else if (v === true) no.setAttribute(k, "");
      else no.setAttribute(k, v);
    }
    for (const f of filhos.flat()) {
      if (f === null || f === undefined || f === false) continue;
      no.append(f.nodeType ? f : document.createTextNode(String(f)));
    }
    return no;
  }

  function svg(tag, attrs, ...filhos) {
    const no = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") no.textContent = v; else no.setAttribute(k, v);
    }
    no.append(...filhos);
    return no;
  }

  function dataHora(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      ", " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  // "em 12 dias", "em 5 horas", "em 20 minutos"
  function faltam(iso) {
    const min = Math.max(1, Math.round((new Date(iso) - new Date()) / 60000));
    if (min >= 2880) return "em " + Math.round(min / 1440) + " dias";
    if (min >= 120) return "em " + Math.round(min / 60) + " horas";
    if (min >= 60) return "em 1 hora";
    return "em " + min + (min === 1 ? " minuto" : " minutos");
  }

  // Uma enquete "aberta" com prazo vencido conta como encerrada.
  function situacao(enquete) {
    if (enquete.status === "aberta" && enquete.encerra_em && new Date(enquete.encerra_em) <= new Date()) {
      return "encerrada";
    }
    return enquete.status;
  }

  const ROTULOS = { rascunho: "Rascunho", aberta: "Em votação", encerrada: "Encerrada" };
  function selo(enquete) {
    const s = situacao(enquete);
    return el("span", { class: "selo " + s, text: ROTULOS[s] || s });
  }

  const CORES = 6; // quantidade de cores definidas no CSS (--cor-1 a --cor-6)
  // Opções na ordem cadastrada, cada uma com sua cor do gráfico.
  function ordenarOpcoes(opcoes) {
    return [...(opcoes || [])]
      .sort((a, b) => a.ordem - b.ordem || a.texto.localeCompare(b.texto, "pt-BR"))
      .map((o, i) => ({ ...o, cor: (i % CORES) + 1 }));
  }

  const plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);
  const rotuloApto = (a) => "Torre " + a.torre + ", apto " + a.numero;

  // Lista de apartamentos ativos, por torre e número.
  async function carregarApartamentos() {
    const { data, error } = await cliente.from("apartamentos").select("id,torre,numero");
    if (error) return [];
    return (data || []).sort((a, b) => a.torre.localeCompare(b.torre, "pt-BR") || a.numero - b.numero);
  }

  // Faz um número "subir" até o novo valor.
  function contar(no, de, ate) {
    if (de === ate || semMovimento()) { no.textContent = String(ate); return; }
    const inicio = performance.now(), duracao = 700;
    (function passo(agora) {
      const t = Math.min(1, (agora - inicio) / duracao);
      no.textContent = String(Math.round(de + (ate - de) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(passo);
    })(inicio);
  }

  // Placar de uma enquete: gráfico de rosca, barras por opção e participação.
  // É montado uma vez e depois só atualizado, para os números se moverem com suavidade.
  function criarPlacar(alvo, enquete, { aoVivo = false } = {}) {
    const R = 46, C = 2 * Math.PI * R;
    const opcoes = ordenarOpcoes(enquete.opcoes);
    const encerrada = situacao(enquete) === "encerrada";
    let totalAtual = 0;
    let primeira = true;

    const titulo = el("h3", { text: encerrada ? "Resultado final" : "Resultado parcial" });
    const vivo = el("span", { class: "ao-vivo", hidden: !aoVivo }, el("i", { "aria-hidden": "true" }), "ao vivo");
    const destaque = el("p", { class: "destaque", hidden: true });
    const nota = el("p", { class: "nota", hidden: true,
      text: "O gráfico será divulgado aqui quando a votação for encerrada." });

    const numero = svg("text", { x: 60, y: 59, class: "rosca-total", "text-anchor": "middle", text: "0" });
    const unidade = svg("text", { x: 60, y: 75, class: "rosca-legenda", "text-anchor": "middle", text: "votos" });
    const rosca = svg("svg", { viewBox: "0 0 120 120", class: "rosca", role: "img" },
      svg("circle", { cx: 60, cy: 60, r: R, class: "rosca-fundo" }));
    const arcos = opcoes.map((o) => {
      const c = svg("circle", { cx: 60, cy: 60, r: R, class: "rosca-fatia cor-" + o.cor, transform: "rotate(-90 60 60)" });
      c.style.strokeDasharray = "0 " + C;
      c.style.strokeDashoffset = "0";
      rosca.append(c);
      return c;
    });
    rosca.append(numero, unidade);

    const linhas = opcoes.map((o) => {
      const conta = el("span", { class: "conta", text: "0 votos · 0%" });
      const barra = el("span", { class: "cor-" + o.cor, style: "width:0%" });
      const meu = el("span", { class: "meu-voto", hidden: true, text: "seu voto" });
      const li = el("li", {},
        el("div", { class: "barra-topo" },
          el("span", { class: "nome" }, el("i", { class: "amostra cor-" + o.cor, "aria-hidden": "true" }), o.texto, meu),
          conta),
        el("div", { class: "trilho", role: "presentation" }, barra));
      return { id: o.id, li, conta, barra, meu };
    });

    const bloco = el("div", { class: "grafico" }, rosca, el("ul", { class: "barras" }, linhas.map((l) => l.li)));
    const geralTexto = el("span", {});
    const geralBarra = el("span", { style: "width:0%" });
    const torresNo = el("div", { class: "torres" });
    const torres = new Map();
    const participacao = el("div", { class: "participacao" },
      geralTexto, el("div", { class: "trilho", role: "presentation" }, geralBarra), torresNo);

    alvo.replaceChildren(el("div", { class: "resultado-topo" }, titulo, vivo), destaque, nota, bloco, participacao);

    function atualizar(r) {
      if (!r) return;
      const pctGeral = r.apartamentos > 0 ? Math.round((r.votos / r.apartamentos) * 100) : 0;
      geralTexto.replaceChildren(
        el("b", { text: String(r.votos) }), " de ", el("b", { text: String(r.apartamentos) }),
        r.apartamentos === 1 ? " apartamento votou" : " apartamentos votaram",
        r.apartamentos > 0 ? " (" + pctGeral + "%)" : "");

      const porTorre = [...(r.torres || [])].sort((a, b) => a.torre.localeCompare(b.torre, "pt-BR"));
      for (const t of porTorre) {
        let no = torres.get(t.torre);
        if (!no) {
          no = { texto: el("span", { class: "torre-conta" }), barra: el("span", { style: "width:0%" }) };
          torres.set(t.torre, no);
          torresNo.append(el("div", { class: "torre" },
            el("div", { class: "torre-topo" }, el("span", { text: "Torre " + t.torre }), no.texto),
            el("div", { class: "trilho", role: "presentation" }, no.barra)));
        }
        no.texto.textContent = t.votos + " de " + t.apartamentos;
        no.pct = t.apartamentos > 0 ? Math.round((t.votos / t.apartamentos) * 100) : 0;
      }

      nota.hidden = r.visivel;
      bloco.hidden = !r.visivel;
      titulo.textContent = !r.visivel ? "Resultado" : encerrada ? "Resultado final" : "Resultado parcial";

      const contagem = new Map((r.opcoes || []).map((o) => [o.id, o.votos]));
      const votosDe = (id) => contagem.get(id) || 0;
      const maior = Math.max(0, ...opcoes.map((o) => votosDe(o.id)));
      const comVotos = opcoes.filter((o) => votosDe(o.id) > 0).length;
      const folga = comVotos > 1 ? 2 : 0;
      const pcts = opcoes.map((o) => (r.votos > 0 ? Math.round((votosDe(o.id) / r.votos) * 100) : 0));

      // Na primeira vez, espera um quadro para o gráfico "se desenhar" a partir do zero.
      const aplicar = () => {
        geralBarra.style.width = Math.min(pctGeral, 100) + "%";
        torres.forEach((no) => { no.barra.style.width = Math.min(no.pct, 100) + "%"; });
        if (!r.visivel) return;
        let inicio = 0;
        opcoes.forEach((o, i) => {
          const n = votosDe(o.id);
          const arco = r.votos > 0 ? (n / r.votos) * C : 0;
          arcos[i].style.strokeDasharray = (n > 0 ? Math.max(arco - folga, 0.5) : 0) + " " + C;
          arcos[i].style.strokeDashoffset = String(-inicio);
          inicio += arco;
          linhas[i].barra.style.width = pcts[i] + "%";
        });
      };
      if (primeira && !semMovimento()) requestAnimationFrame(() => requestAnimationFrame(aplicar)); else aplicar();
      primeira = false;

      if (r.visivel) {
        opcoes.forEach((o, i) => {
          const n = votosDe(o.id);
          linhas[i].conta.textContent = plural(n, "voto", "votos") + " · " + pcts[i] + "%";
          linhas[i].li.classList.toggle("lider", n > 0 && n === maior);
        });
        contar(numero, totalAtual, r.votos);
        totalAtual = r.votos;
        unidade.textContent = r.votos === 1 ? "voto" : "votos";
        rosca.setAttribute("aria-label", r.votos
          ? "Gráfico do resultado: " + opcoes.map((o, i) => o.texto + " " + pcts[i] + "%").join(", ")
          : "Gráfico do resultado: nenhum voto ainda");

        const lideres = opcoes.filter((o) => maior > 0 && votosDe(o.id) === maior);
        destaque.hidden = !(encerrada && lideres.length);
        if (encerrada && lideres.length === 1) {
          destaque.replaceChildren("Opção mais votada: ", el("b", { text: lideres[0].texto }),
            " (" + pcts[opcoes.indexOf(lideres[0])] + "% dos votos).");
        } else if (encerrada && lideres.length > 1) {
          destaque.replaceChildren("Empate entre ", el("b", { text: lideres.map((o) => o.texto).join(" e ") }), ".");
        }
      } else {
        destaque.hidden = true;
      }
    }

    function marcar(opcaoId) {
      linhas.forEach((l) => { l.meu.hidden = l.id !== opcaoId; });
    }

    return { atualizar, marcar };
  }

  // Leitura e gravação no aparelho, sem quebrar em navegação privada.
  const memoria = {
    ler(chave) { try { return localStorage.getItem(chave); } catch { return null; } },
    gravar(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento */ } },
    apagar(chave) { try { localStorage.removeItem(chave); } catch { /* sem armazenamento */ } },
  };

  function avisoConfiguracao() {
    return el("p", { class: "mensagem aviso" },
      "O site ainda não foi ligado ao banco de dados. Preencha o arquivo ",
      el("code", { text: "config.js" }),
      " com o endereço e a chave pública do projeto no Supabase (veja o passo a passo no LEIA-ME).");
  }

  // Se o config.js indicar um logotipo, ele ocupa o lugar do emblema no cabeçalho.
  if (cfg.logo) {
    document.querySelectorAll("[data-marca]").forEach((n) => {
      n.classList.add("com-logo");
      n.replaceChildren(el("img", { class: "logo", src: cfg.logo, alt: cfg.condominio || "Condomínio",
        width: "750", height: "212", decoding: "async" }));
    });
  }

  document.querySelectorAll("[data-condominio]").forEach((n) => {
    n.textContent = cfg.condominio || "Condomínio";
  });
  document.querySelectorAll("[data-comissao]").forEach((n) => {
    n.textContent = cfg.comissao || "Enquetes";
  });

  window.Enquete = {
    cfg, configurado, cliente, el, svg, dataHora, faltam, situacao, selo, ordenarOpcoes, plural,
    rotuloApto, carregarApartamentos, criarPlacar, memoria, avisoConfiguracao, semMovimento,
  };
})();
