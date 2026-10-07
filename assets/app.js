// Página dos moradores: escolher, conferir, registrar o voto e acompanhar o gráfico ao vivo.
(async function () {
  "use strict";

  const { cfg, cliente, configurado, el, svg, dataHora, faltam, situacao, selo, ordenarOpcoes,
          rotuloApto, carregarApartamentos, criarPlacar, memoria, avisoConfiguracao,
          semMovimento } = window.Enquete;

  const estadoNo = document.getElementById("estado");
  const abertasNo = document.getElementById("abertas");
  const encerradasNo = document.getElementById("encerradas");
  const secaoEncerradas = document.getElementById("secao-encerradas");

  if (!configurado || !cliente) {
    abertasNo.replaceChildren();
    estadoNo.replaceWith(avisoConfiguracao());
    return;
  }

  const MENSAGENS = {
    ja_votou: "Este apartamento já votou nesta enquete. Se não foi você, procure a comissão.",
    nome_invalido: "Informe o nome completo de quem está votando.",
    apartamento_invalido: "Apartamento não encontrado. Atualize a página e selecione de novo.",
    encerrada: "Esta enquete já foi encerrada.",
    opcao_invalida: "Esta opção não está mais disponível. Atualize a página.",
    enquete_inexistente: "Esta enquete não está mais disponível. Atualize a página.",
    falha: "Não foi possível registrar o voto. Verifique a conexão e tente de novo.",
  };

  const [resEnquetes, apartamentos] = await Promise.all([
    cliente.from("enquetes")
      .select("id,titulo,descricao,status,resultado,encerra_em,criada_em,opcoes(id,texto,ordem)")
      .order("criada_em", { ascending: false }),
    carregarApartamentos(),
  ]);

  abertasNo.replaceChildren();
  if (resEnquetes.error) {
    estadoNo.className = "mensagem erro";
    estadoNo.textContent = "Não foi possível carregar as enquetes. Atualize a página em instantes.";
    return;
  }
  estadoNo.remove();

  const torres = [...new Set(apartamentos.map((a) => a.torre))];
  const porId = new Map(apartamentos.map((a) => [a.id, a]));

  const enquetes = resEnquetes.data || [];
  const abertas = enquetes.filter((e) => situacao(e) === "aberta");
  const encerradas = enquetes.filter((e) => situacao(e) === "encerrada");
  const atualizarAbertas = [];

  if (!abertas.length) {
    abertasNo.append(el("p", { class: "vazio", text: "Nenhuma enquete em votação no momento." }));
  }
  for (const e of abertas) {
    const c = cartao(e);
    abertasNo.append(c.artigo);
    atualizarAbertas.push(c.atualizar);
  }
  if (encerradas.length) {
    secaoEncerradas.hidden = false;
    for (const e of encerradas) encerradasNo.append(cartao(e).artigo);
  }

  // Gráfico ao vivo: as enquetes abertas se atualizam a cada 10 segundos e ao voltar para a aba.
  const atualizarTudo = () => {
    if (document.visibilityState === "visible") atualizarAbertas.forEach((f) => f());
  };
  setInterval(atualizarTudo, 10000);
  document.addEventListener("visibilitychange", atualizarTudo);

  // ------------------------------------------------------------------

  function cartao(enquete) {
    const aberta = situacao(enquete) === "aberta";
    const opcoes = ordenarOpcoes(enquete.opcoes);
    let prazo = "";
    if (enquete.encerra_em) {
      prazo = aberta
        ? "Encerra " + faltam(enquete.encerra_em) + " · " + dataHora(enquete.encerra_em)
        : "Encerrada em " + dataHora(enquete.encerra_em);
    }

    const areaVoto = el("div", { class: "area-voto" });
    const areaResultado = el("section", { class: "resultado", hidden: true });
    const placar = criarPlacar(areaResultado, enquete, { aoVivo: aberta });
    const artigo = el("article", { class: "enquete" },
      el("header", {},
        selo(enquete),
        el("h2", { text: enquete.titulo }),
        enquete.descricao && el("p", { class: "descricao", text: enquete.descricao }),
        prazo && el("p", { class: "prazo", text: prazo })),
      aberta && areaVoto,
      areaResultado);

    async function atualizar() {
      const { data, error } = await cliente.rpc("resultado", { p_enquete: enquete.id });
      if (error || !data) return;
      placar.atualizar(data);
      areaResultado.hidden = false;
    }

    if (aberta) montarVoto(areaVoto, enquete, opcoes, placar, atualizar);
    atualizar();
    return { artigo, atualizar };
  }

  function montarVoto(area, enquete, opcoes, placar, aoVotar) {
    const sufixo = enquete.id.slice(0, 8);
    const chaveVoto = "enquete:voto:" + enquete.id;
    const textoOpcao = new Map(opcoes.map((o) => [o.id, o]));

    // O que o morador já preencheu; sobrevive ao ir e voltar entre as telas.
    const salvo = porId.get(memoria.ler("enquete:apto"));
    const preenchido = {
      opcao: "",
      apto: salvo ? salvo.id : "",
      nome: memoria.ler("enquete:nome") || "",
      lembrar: true,
      outro: false,   // votando por um apartamento diferente do que o aparelho lembra
    };

    let registrado = null;
    try { registrado = JSON.parse(memoria.ler(chaveVoto) || "null"); } catch { registrado = null; }
    if (registrado && porId.has(registrado.apto) && textoOpcao.has(registrado.opcao)) {
      telaComprovante(registrado, false);
    } else {
      telaFormulario();
    }

    function trocar(tela, focar) {
      area.replaceChildren(tela);
      if (focar) {
        focar.focus({ preventScroll: true });
        area.scrollIntoView({ block: "nearest", behavior: semMovimento() ? "auto" : "smooth" });
      }
    }

    // ---------- 1. escolher e identificar
    function telaFormulario(erro) {
      if (!apartamentos.length) {
        area.replaceChildren(el("p", { class: "mensagem aviso",
          text: "Não foi possível carregar a lista de apartamentos. Atualize a página." }));
        return;
      }

      const aptoAtual = porId.get(preenchido.apto);
      const seletorApto = el("select", { id: "apto-" + sufixo, required: true });
      const campoNome = el("input", {
        id: "nome-" + sufixo, type: "text", required: true, maxlength: "80",
        autocomplete: "name", autocapitalize: "words", enterkeyhint: "done", value: preenchido.nome,
      });
      const lembrar = el("input", { id: "lembrar-" + sufixo, type: "checkbox", checked: preenchido.lembrar });
      const mensagem = el("p", { class: "mensagem" + (erro ? " erro" : ""), role: "alert", text: erro || "" });

      const grupoTorre = el("div", { class: "segmento", role: "radiogroup", "aria-label": "Torre" },
        torres.map((t) => el("label", {},
          el("input", { type: "radio", name: "torre-" + sufixo, value: t, checked: !!aptoAtual && aptoAtual.torre === t }),
          el("span", { text: t }))));
      const torreMarcada = () => (grupoTorre.querySelector("input:checked") || {}).value || "";

      function listarAptos(selecionado) {
        const daTorre = apartamentos.filter((a) => a.torre === torreMarcada());
        seletorApto.disabled = !daTorre.length;
        seletorApto.replaceChildren(
          el("option", { value: "", text: daTorre.length ? "Selecione" : "Escolha a torre primeiro" }),
          ...daTorre.map((a) => el("option", { value: a.id, text: String(a.numero) })));
        seletorApto.value = selecionado || "";
      }
      grupoTorre.addEventListener("change", () => listarAptos(""));
      listarAptos(preenchido.apto);

      const form = el("form", { novalidate: true },
        el("fieldset", {},
          el("legend", { text: "1. Escolha uma opção" }),
          opcoes.map((o) =>
            el("label", { class: "opcao" },
              el("input", { type: "radio", name: "opcao-" + sufixo, value: o.id, checked: preenchido.opcao === o.id }),
              el("i", { class: "amostra cor-" + o.cor, "aria-hidden": "true" }),
              el("span", { class: "opcao-texto", text: o.texto }),
              el("i", { class: "bolinha", "aria-hidden": "true" })))),
        el("fieldset", {},
          el("legend", { text: "2. Identifique seu apartamento" }),
          grupoTorre,
          el("div", { class: "campo" },
            el("label", { class: "rotulo", for: seletorApto.id, text: "Apartamento" }), seletorApto),
          el("div", { class: "campo" },
            el("label", { class: "rotulo", for: campoNome.id, text: "Nome completo de quem está votando" }), campoNome),
          el("label", { class: "marcar" }, lembrar, "Lembrar neste aparelho para as próximas enquetes")),
        mensagem,
        el("button", { type: "submit", text: "Continuar" }));

      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const marcada = form.querySelector('input[name^="opcao-"]:checked');
        const nome = campoNome.value.trim().replace(/\s+/g, " ");
        const avisar = (texto) => { mensagem.className = "mensagem erro"; mensagem.textContent = texto; };
        if (!marcada) return avisar("Escolha uma das opções.");
        if (!torreMarcada()) return avisar("Selecione a torre.");
        if (!porId.has(seletorApto.value)) return avisar("Selecione o apartamento.");
        if (nome.length < 5) return avisar(MENSAGENS.nome_invalido);
        Object.assign(preenchido, { opcao: marcada.value, apto: seletorApto.value, nome, lembrar: lembrar.checked });
        telaConfirmacao();
      });

      area.replaceChildren(form);
      if (erro) area.scrollIntoView({ block: "nearest" });
    }

    // ---------- 2. conferir e registrar
    function telaConfirmacao() {
      const apto = porId.get(preenchido.apto);
      const opcao = textoOpcao.get(preenchido.opcao);
      const titulo = el("h3", { tabindex: "-1", text: "Confira antes de registrar" });
      const mensagem = el("p", { class: "mensagem", role: "alert" });
      const confirmar = el("button", { type: "button", text: "Confirmar voto" });
      const corrigir = el("button", { type: "button", class: "secundario", text: "Corrigir",
        onclick: () => telaFormulario() });

      confirmar.addEventListener("click", async () => {
        confirmar.disabled = corrigir.disabled = true;
        confirmar.textContent = "Registrando…";
        let s = "falha";
        try {
          const { data, error } = await cliente.rpc("votar", {
            p_enquete: enquete.id, p_opcao: opcao.id, p_apartamento: apto.id, p_nome: preenchido.nome,
          });
          if (!error && typeof data === "string") s = data;
        } catch { /* fica como falha */ }

        if (s === "ok") {
          if (preenchido.lembrar) {
            memoria.gravar("enquete:apto", apto.id);
            memoria.gravar("enquete:nome", preenchido.nome);
          } else if (!preenchido.outro) {
            memoria.apagar("enquete:apto");
            memoria.apagar("enquete:nome");
          }
          const voto = { apto: apto.id, opcao: opcao.id, nome: preenchido.nome, quando: new Date().toISOString() };
          memoria.gravar(chaveVoto, JSON.stringify(voto));
          telaComprovante(voto, true);
          aoVotar();
          return;
        }
        if (s === "falha") {
          confirmar.disabled = corrigir.disabled = false;
          confirmar.textContent = "Confirmar voto";
          mensagem.className = "mensagem erro";
          mensagem.textContent = MENSAGENS.falha;
          return;
        }
        telaFormulario(MENSAGENS[s] || MENSAGENS.falha);
        if (s === "encerrada") aoVotar();
      });

      trocar(el("div", { class: "confirmacao" },
        titulo,
        el("dl", { class: "resumo" },
          el("dt", { text: "Sua escolha" }),
          el("dd", {}, el("i", { class: "amostra cor-" + opcao.cor, "aria-hidden": "true" }), opcao.texto),
          el("dt", { text: "Apartamento" }), el("dd", { text: rotuloApto(apto) }),
          el("dt", { text: "Votante" }), el("dd", { text: preenchido.nome })),
        el("p", { class: "nota", text: "Depois de registrado, o voto do apartamento não pode ser alterado." }),
        mensagem,
        el("div", { class: "botoes" }, confirmar, corrigir)), titulo);
    }

    // ---------- 3. comprovante
    function telaComprovante(voto, acabouDeVotar) {
      const apto = porId.get(voto.apto);
      const opcao = textoOpcao.get(voto.opcao);
      placar.marcar(opcao.id);

      const endereco = location.origin + location.pathname;
      const convite = "Já votei na enquete “" + enquete.titulo + "” da " + (cfg.comissao || "comissão") +
        " do " + (cfg.condominio || "condomínio") + ". Vote também, leva menos de 1 minuto: " + endereco;
      const copiado = el("span", { class: "nota", role: "status" });
      const titulo = el("h3", { tabindex: "-1", text: "Voto registrado" });

      const selinho = svg("svg", { viewBox: "0 0 52 52", class: "visto" + (acabouDeVotar ? " animar" : ""), "aria-hidden": "true" },
        svg("circle", { cx: 26, cy: 26, r: 24, class: "visto-circulo" }),
        svg("path", { d: "M15 27l8 8 15-17", class: "visto-traco" }));

      const tela = el("div", { class: "comprovante" },
        el("div", { class: "comprovante-topo" }, selinho,
          el("div", {}, titulo,
            el("p", { class: "nota", text: "Obrigado por participar, " + voto.nome.split(" ")[0] + "." }))),
        el("dl", { class: "resumo" },
          el("dt", { text: "Sua escolha" }),
          el("dd", {}, el("i", { class: "amostra cor-" + opcao.cor, "aria-hidden": "true" }), opcao.texto),
          el("dt", { text: "Apartamento" }), el("dd", { text: rotuloApto(apto) }),
          el("dt", { text: "Registrado em" }), el("dd", { text: dataHora(voto.quando) })),
        el("div", { class: "botoes" },
          el("a", { class: "botao whatsapp", target: "_blank", rel: "noopener",
            href: "https://wa.me/?text=" + encodeURIComponent(convite), text: "Convidar vizinhos pelo WhatsApp" }),
          el("button", { type: "button", class: "secundario", text: "Copiar link da enquete", onclick: async () => {
            try { await navigator.clipboard.writeText(endereco); copiado.textContent = "Link copiado."; }
            catch { copiado.textContent = endereco; }
          } })),
        copiado,
        el("button", { type: "button", class: "link", text: "Votar por outro apartamento", onclick: () => {
          Object.assign(preenchido, { opcao: "", apto: "", nome: "", lembrar: false, outro: true });
          telaFormulario();
        } }));

      trocar(tela, acabouDeVotar ? titulo : null);
      if (acabouDeVotar) {
        if (navigator.vibrate) { try { navigator.vibrate(35); } catch { /* sem vibração */ } }
        chuvaDeFolhas(selinho);
      }
    }
  }

  // Comemoração discreta ao registrar o voto: folhas saem do selo e caem.
  function chuvaDeFolhas(origem) {
    if (semMovimento()) return;
    const tela = el("canvas", { class: "folhas", "aria-hidden": "true" });
    document.body.append(tela);
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    const L = window.innerWidth, A = window.innerHeight;
    tela.width = L * escala; tela.height = A * escala;
    const ctx = tela.getContext("2d");
    ctx.scale(escala, escala);

    const estilo = getComputedStyle(document.documentElement);
    const cores = ["--cor-1", "--folha", "--cor-3", "--cor-2"].map((v) => estilo.getPropertyValue(v).trim() || "#1e6a48");
    const caixa = origem.getBoundingClientRect();
    const x0 = caixa.left + caixa.width / 2, y0 = caixa.top + caixa.height / 2;
    const folhas = Array.from({ length: 28 }, (_, i) => {
      const angulo = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const forca = 3 + Math.random() * 6;
      return { x: x0, y: y0, vx: Math.cos(angulo) * forca, vy: Math.sin(angulo) * forca - 2,
               giro: Math.random() * 6.28, vGiro: (Math.random() - 0.5) * 0.3,
               tam: 7 + Math.random() * 7, cor: cores[i % cores.length] };
    });

    const inicio = performance.now(), duracao = 2200;
    (function quadro(agora) {
      const t = (agora - inicio) / duracao;
      ctx.clearRect(0, 0, L, A);
      if (t >= 1) { tela.remove(); return; }
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      for (const f of folhas) {
        f.vy += 0.16; f.vx *= 0.99;
        f.x += f.vx + Math.sin(agora / 240 + f.giro) * 0.6; f.y += f.vy; f.giro += f.vGiro;
        ctx.save();
        ctx.translate(f.x, f.y); ctx.rotate(f.giro);
        ctx.fillStyle = f.cor;
        ctx.beginPath();
        ctx.moveTo(0, -f.tam);
        ctx.quadraticCurveTo(f.tam * 0.75, 0, 0, f.tam);
        ctx.quadraticCurveTo(-f.tam * 0.75, 0, 0, -f.tam);
        ctx.fill();
        ctx.restore();
      }
      requestAnimationFrame(quadro);
    })(inicio);
  }
})();
