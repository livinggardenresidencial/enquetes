// Painel da administração: criar, abrir e encerrar enquetes; ver e anular votos.
(async function () {
  "use strict";

  const { cliente, configurado, el, dataHora, situacao, selo, ordenarOpcoes,
          carregarApartamentos, criarPlacar, avisoConfiguracao } = window.Enquete;
  const $ = (id) => document.getElementById(id);

  const estadoNo = $("estado");
  const telaLogin = $("login");
  const painel = $("painel");
  const botaoSair = $("sair");

  if (!configurado || !cliente) {
    estadoNo.replaceWith(avisoConfiguracao());
    return;
  }

  let enquetes = [];
  let apartamentos = [];            // [{id, torre, numero}]
  const detalhesAbertos = new Set();

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------

  function mensagem(no, tipo, texto) {
    no.className = "mensagem" + (tipo ? " " + tipo : "");
    no.textContent = texto || "";
  }

  // Botão que pede um segundo clique para ações que não têm volta.
  function comConfirmacao(botao, rotuloConfirmar, acao) {
    const original = botao.textContent;
    let armado = false;
    let relogio;
    const desarmar = () => {
      armado = false;
      botao.textContent = original;
      botao.classList.remove("confirmar");
    };
    botao.addEventListener("click", async () => {
      if (!armado) {
        armado = true;
        botao.textContent = rotuloConfirmar;
        botao.classList.add("confirmar");
        relogio = setTimeout(desarmar, 5000);
        return;
      }
      clearTimeout(relogio);
      desarmar();
      botao.disabled = true;
      try { await acao(); } finally { botao.disabled = false; }
    });
    return botao;
  }

  // ------------------------------------------------------------------
  // Entrada
  // ------------------------------------------------------------------

  $("form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("login-msg");
    const botao = $("login-botao");
    mensagem(msg);
    botao.disabled = true;
    const { error } = await cliente.auth.signInWithPassword({
      email: $("login-email").value.trim(),
      password: $("login-senha").value,
    });
    botao.disabled = false;
    if (error) return mensagem(msg, "erro", "E-mail ou senha incorretos.");
    $("login-senha").value = "";
    await entrar();
  });

  botaoSair.addEventListener("click", async () => {
    await cliente.auth.signOut();
    location.reload();
  });

  async function entrar() {
    const { data: ehAdmin, error } = await cliente.rpc("eh_admin");
    if (error || ehAdmin !== true) {
      await cliente.auth.signOut();
      mostrarLogin();
      mensagem($("login-msg"), "erro", error
        ? "Não foi possível verificar a permissão. Tente de novo."
        : "Esta conta não está cadastrada como administradora das enquetes.");
      return;
    }
    estadoNo.hidden = true;
    telaLogin.hidden = true;
    painel.hidden = false;
    botaoSair.hidden = false;
    apartamentos = await carregarApartamentos();
    await carregarEnquetes();
  }

  function mostrarLogin() {
    estadoNo.hidden = true;
    painel.hidden = true;
    botaoSair.hidden = true;
    telaLogin.hidden = false;
  }

  // ------------------------------------------------------------------
  // Enquetes
  // ------------------------------------------------------------------

  async function carregarEnquetes() {
    const { data, error } = await cliente.from("enquetes")
      .select("id,titulo,descricao,status,resultado,encerra_em,criada_em,opcoes(id,texto,ordem)")
      .order("criada_em", { ascending: false });
    if (error) {
      $("lista-enquetes").replaceChildren(el("p", { class: "mensagem erro", text: "Não foi possível carregar as enquetes." }));
      return;
    }
    enquetes = data || [];
    const alvo = $("lista-enquetes");
    if (!enquetes.length) {
      alvo.replaceChildren(el("p", { class: "vazio", text: "Nenhuma enquete ainda. Crie a primeira no formulário abaixo." }));
      return;
    }
    alvo.replaceChildren(...enquetes.map(itemEnquete));
  }

  function itemEnquete(enquete) {
    const s = situacao(enquete);
    const partes = ["Criada em " + dataHora(enquete.criada_em)];
    if (enquete.encerra_em) partes.push((s === "encerrada" ? "prazo encerrado em " : "encerra em ") + dataHora(enquete.encerra_em));
    partes.push(enquete.resultado === "sempre" ? "gráfico visível durante a votação" : "gráfico só depois de encerrada");

    const aviso = el("p", { class: "mensagem", role: "alert" });
    const detalhe = el("div", { class: "detalhe", hidden: !detalhesAbertos.has(enquete.id) });
    const acoes = el("div", { class: "linha-acoes" });

    async function mudar(campos, erro) {
      const { error } = await cliente.from("enquetes").update(campos).eq("id", enquete.id);
      if (error) return mensagem(aviso, "erro", erro);
      await carregarEnquetes();
    }

    if (s === "rascunho") {
      acoes.append(el("button", { type: "button", class: "pequeno", text: "Abrir votação", onclick: () => {
        if (enquete.encerra_em && new Date(enquete.encerra_em) <= new Date()) {
          return mensagem(aviso, "aviso", "O prazo desta enquete já passou. Exclua o rascunho e crie outro com nova data.");
        }
        mudar({ status: "aberta" }, "Não foi possível abrir a votação.");
      } }));
    }
    if (s === "aberta") {
      acoes.append(comConfirmacao(
        el("button", { type: "button", class: "pequeno perigo", text: "Encerrar votação" }),
        "Confirmar encerramento",
        () => mudar({ status: "encerrada" }, "Não foi possível encerrar.")));
    }
    if (s === "encerrada") {
      acoes.append(el("button", { type: "button", class: "pequeno secundario", text: "Reabrir votação",
        onclick: () => mudar({ status: "aberta", encerra_em: null }, "Não foi possível reabrir.") }));
    }
    if (s !== "rascunho") {
      const ver = el("button", { type: "button", class: "pequeno secundario",
        text: detalhesAbertos.has(enquete.id) ? "Ocultar votos" : "Ver votos" });
      ver.addEventListener("click", () => {
        const abrir = detalhe.hidden;
        detalhe.hidden = !abrir;
        ver.textContent = abrir ? "Ocultar votos" : "Ver votos";
        if (abrir) { detalhesAbertos.add(enquete.id); carregarDetalhe(enquete, detalhe); }
        else detalhesAbertos.delete(enquete.id);
      });
      acoes.append(ver);
    }
    if (s !== "aberta") {
      acoes.append(comConfirmacao(
        el("button", { type: "button", class: "pequeno perigo", text: "Excluir" }),
        s === "rascunho" ? "Confirmar exclusão" : "Excluir enquete e votos",
        async () => {
          const { error } = await cliente.from("enquetes").delete().eq("id", enquete.id);
          if (error) return mensagem(aviso, "erro", "Não foi possível excluir.");
          detalhesAbertos.delete(enquete.id);
          await carregarEnquetes();
        }));
    }

    if (!detalhe.hidden) carregarDetalhe(enquete, detalhe);

    return el("div", { class: "item-enquete" },
      el("div", { class: "cabeca-item" }, el("h3", { text: enquete.titulo }), selo(enquete)),
      el("p", { class: "meta", text: partes.join(" · ") + "." }),
      s === "rascunho" && el("p", { class: "meta",
        text: "Opções: " + ordenarOpcoes(enquete.opcoes).map((o) => o.texto).join(" | ") }),
      acoes, aviso, detalhe);
  }

  async function carregarDetalhe(enquete, alvo) {
    if (!alvo.childElementCount) alvo.replaceChildren(el("p", { class: "nota", text: "Carregando votos…" }));

    const [resPlacar, resVotos] = await Promise.all([
      cliente.rpc("resultado", { p_enquete: enquete.id }),
      cliente.from("votos").select("apartamento_id,opcao_id,nome,criado_em")
        .eq("enquete_id", enquete.id).order("criado_em", { ascending: true }),
    ]);
    if (resPlacar.error || resVotos.error) {
      alvo.replaceChildren(el("p", { class: "mensagem erro", text: "Não foi possível carregar os votos." }));
      return;
    }

    const placar = el("section", { class: "resultado" });
    criarPlacar(placar, enquete).atualizar(resPlacar.data);

    const votos = resVotos.data || [];
    const nomeOpcao = new Map((enquete.opcoes || []).map((o) => [o.id, o.texto]));
    const porId = new Map(apartamentos.map((a) => [a.id, a]));
    const jaVotaram = new Set(votos.map((v) => v.apartamento_id));
    const torres = [...new Set(apartamentos.map((a) => a.torre))];

    const corpo = el("tbody", {}, votos.map((v) => {
      const apto = porId.get(v.apartamento_id);
      return el("tr", {},
        el("td", { text: apto ? apto.torre : "—" }),
        el("td", { class: "num", text: apto ? String(apto.numero) : v.apartamento_id }),
        el("td", { text: v.nome }),
        el("td", { text: nomeOpcao.get(v.opcao_id) || "(opção removida)" }),
        el("td", { class: "num", text: dataHora(v.criado_em) }),
        el("td", { class: "acoes" }, comConfirmacao(
          el("button", { type: "button", class: "pequeno perigo", text: "Anular" }),
          "Confirmar",
          async () => {
            await cliente.from("votos").delete()
              .eq("enquete_id", enquete.id).eq("apartamento_id", v.apartamento_id);
            await carregarDetalhe(enquete, alvo);
          })));
    }));

    const pendentes = torres.map((t) => {
      const faltam = apartamentos.filter((a) => a.torre === t && !jaVotaram.has(a.id)).map((a) => a.numero);
      return el("p", { class: "pendentes" },
        el("b", { text: "Torre " + t + " · faltam " + faltam.length + ": " }),
        faltam.length ? faltam.join(", ") : "todos já votaram.");
    });

    alvo.replaceChildren(
      placar,
      votos.length
        ? el("div", { class: "rolagem" }, el("table", {},
            el("thead", {}, el("tr", {},
              el("th", { text: "Torre" }), el("th", { text: "Apto" }), el("th", { text: "Votante" }),
              el("th", { text: "Voto" }), el("th", { text: "Registrado em" }), el("th", {}))),
            corpo))
        : el("p", { class: "nota", text: "Nenhum voto registrado ainda." }),
      ...pendentes,
      el("p", { class: "nota",
        text: "Anular um voto libera o apartamento para votar de novo. Use quando o morador avisar que errou ou que outra pessoa votou em nome da unidade." }));
  }

  $("form-enquete").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("nova-msg");
    const titulo = $("nova-titulo").value.trim();
    const opcoes = [...new Set($("nova-opcoes").value.split("\n").map((t) => t.trim()).filter(Boolean))];
    const prazoTexto = $("nova-prazo").value;
    const prazo = prazoTexto ? new Date(prazoTexto) : null;

    if (titulo.length < 3) return mensagem(msg, "erro", "Escreva a pergunta da enquete.");
    if (opcoes.length < 2) return mensagem(msg, "erro", "Informe pelo menos duas opções diferentes, uma por linha.");
    if (opcoes.some((o) => o.length > 120)) return mensagem(msg, "erro", "Cada opção pode ter no máximo 120 caracteres.");
    if (prazo && (isNaN(prazo) || prazo <= new Date())) return mensagem(msg, "erro", "A data de encerramento precisa estar no futuro.");

    const botao = $("nova-botao");
    botao.disabled = true;
    const { error } = await cliente.rpc("admin_criar_enquete", {
      p_titulo: titulo,
      p_descricao: $("nova-descricao").value.trim(),
      p_resultado: $("nova-resultado").value,
      p_encerra_em: prazo ? prazo.toISOString() : null,
      p_opcoes: opcoes,
    });
    botao.disabled = false;
    if (error) return mensagem(msg, "erro", "Não foi possível criar a enquete. Tente de novo.");

    ev.target.reset();
    mensagem(msg, "ok", "Rascunho criado. Confira na lista acima e clique em Abrir votação.");
    await carregarEnquetes();
  });

  // ------------------------------------------------------------------
  // Início
  // ------------------------------------------------------------------

  const { data: sessao } = await cliente.auth.getSession();
  if (sessao && sessao.session) await entrar(); else mostrarLogin();
})();
