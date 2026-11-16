/* =========================================================
   CARNÊS — aba para acessar todos os carnês existentes e
   gerar novos para clientes com compras/dívidas.

   Reaproveita js/carne.js:
     window.gerarCarneCliente(clienteId, "link" | "pdf")
   que abre o mesmo modal usado em Contas a receber (cria o
   carnê, mostra o link de sempre, WhatsApp e PDF).
========================================================= */
(function () {
    "use strict";

    let clientes = [];
    let carnesPorCliente = {};   /* cliente_id -> carnê ativo */
    let resumoPorCliente = {};   /* cliente_id -> { aberto, atraso, nAtraso, proximo } */
    let filtro = "carnes";       /* carnes | sem | todos */
    let busca = "";

    const el = id => document.getElementById(id);

    const escapar = v => String(v == null ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    function linkDoCarne(codigo) {
        return location.origin + "/?carne=" + encodeURIComponent(codigo);
    }

    /* Busca todas as linhas, em páginas (o Supabase limita a 1000). */
    async function buscarTudo(montar) {
        const passo = 1000;
        let todas = [];
        for (let inicio = 0; ; inicio += passo) {
            const pagina = await supabaseQuery(db =>
                montar(db).range(inicio, inicio + passo - 1)
            );
            todas = todas.concat(pagina || []);
            if (!pagina || pagina.length < passo) {
                break;
            }
        }
        return todas;
    }

    /*
        Lista os carnês ativos pela API (/api/cobranca, ação listarCarnes).
        A API usa a chave de serviço e enxerga os mesmos carnês que o botão
        CARNÊ e os links dos clientes. Ler a tabela direto pelo navegador
        pode voltar vazio quando o RLS da tabela `carnes` não permite o
        usuário logado (caso comum em carnês criados pelo sistema antigo).
    */
    async function listarCarnesAtivos() {
        let falhaApi = null;
        try {
            const { data } = await window.supabaseClient.auth.getSession();
            const token = data && data.session && data.session.access_token;
            if (!token) {
                throw new Error("Sessão expirada. Entre novamente no sistema.");
            }
            const resposta = await fetch("/api/cobranca", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify({ acao: "listarCarnes" })
            });
            const corpo = await resposta.json().catch(() => null);
            if (!resposta.ok || !corpo || !Array.isArray(corpo.carnes)) {
                throw new Error(
                    (corpo && corpo.erro) ||
                    "A API do carnê (/api/cobranca) não respondeu."
                );
            }
            return corpo.carnes;
        } catch (erro) {
            falhaApi = erro;
            console.warn("[carnes] API listarCarnes falhou:", erro);
        }

        /* Fallback: leitura direta (só funciona se o RLS permitir). */
        const direto = await buscarTudo(db => db
            .from("carnes")
            .select("id,cliente_id,codigo_acesso,ativo,criado_em")
            .eq("ativo", true)
            .order("criado_em", { ascending: true }));

        if (!direto.length) {
            toast(
                "Não foi possível listar os carnês: " +
                (falhaApi && falhaApi.message ? falhaApi.message : "erro na API do carnê") +
                " Abra o sistema pelo endereço publicado na Vercel.",
                "error"
            );
        }
        return direto;
    }

    async function carregar() {
        try {
            const [listaClientes, carnes, parcelas] = await Promise.all([
                buscarTudo(db => db
                    .from("clientes")
                    .select("id,nome,cpf_cnpj,telefone")
                    .order("nome", { ascending: true })),
                listarCarnesAtivos(),
                buscarTudo(db => db
                    .from("parcelas")
                    .select("id,valor,valor_pago,vencimento,status,vendas!inner(cliente_id,status)")
                    .neq("status", "paga")
                    .neq("vendas.status", "cancelada")
                    .order("id", { ascending: true }))
            ]);

            clientes = listaClientes;

            carnesPorCliente = {};
            carnes.forEach(c => { carnesPorCliente[c.cliente_id] = c; });

            resumoPorCliente = {};
            const hoje = todayISO();
            parcelas.forEach(p => {
                const clienteId = p.vendas && p.vendas.cliente_id;
                if (!clienteId) {
                    return;
                }
                const saldo = Number(p.valor || 0) - Number(p.valor_pago || 0);
                if (saldo <= 0) {
                    return;
                }
                const r = resumoPorCliente[clienteId] ||
                    (resumoPorCliente[clienteId] =
                        { aberto: 0, atraso: 0, nAtraso: 0, proximo: null });
                r.aberto += saldo;
                if (p.vencimento && p.vencimento < hoje) {
                    r.atraso += saldo;
                    r.nAtraso += 1;
                }
                if (p.vencimento && p.vencimento >= hoje &&
                    (!r.proximo || p.vencimento < r.proximo)) {
                    r.proximo = p.vencimento;
                }
            });

            renderResumo();
            renderTabela();
        } catch (erro) {
            console.error("[carnes]", erro);
            el("carnes-table").innerHTML =
                '<tr><td colspan="7" class="empty">Não foi possível carregar os carnês.</td></tr>';
        }
    }

    function renderResumo() {
        const ids = Object.keys(resumoPorCliente);
        const semCarne = ids.filter(id => !carnesPorCliente[id]).length;
        const totalAberto = ids.reduce((s, id) => s + resumoPorCliente[id].aberto, 0);
        const totalAtraso = ids.reduce((s, id) => s + resumoPorCliente[id].atraso, 0);
        const nAtraso = ids.filter(id => resumoPorCliente[id].nAtraso > 0).length;

        el("m-carnes").textContent = Object.keys(carnesPorCliente).length;
        el("m-sem").textContent = semCarne;
        el("m-aberto").textContent = fmtMoney(totalAberto);
        el("m-atraso").textContent = fmtMoney(totalAtraso);
        el("m-atraso-n").textContent =
            nAtraso + (nAtraso === 1 ? " cliente em atraso" : " clientes em atraso");
    }

    function linhasFiltradas() {
        const termo = busca.trim().toLowerCase();
        const termoNum = termo.replace(/\D/g, "");

        return clientes.filter(c => {
            const tem = Boolean(carnesPorCliente[c.id]);
            const deve = Boolean(resumoPorCliente[c.id]);

            if (filtro === "carnes" && !tem) { return false; }
            if (filtro === "sem" && !(deve && !tem)) { return false; }

            if (!termo) { return true; }
            return (
                String(c.nome || "").toLowerCase().includes(termo) ||
                (termoNum && String(c.cpf_cnpj || "").replace(/\D/g, "").includes(termoNum)) ||
                (termoNum && String(c.telefone || "").replace(/\D/g, "").includes(termoNum))
            );
        }).sort((a, b) => {
            /* quem está em atraso aparece primeiro, depois por maior dívida */
            const ra = resumoPorCliente[a.id], rb = resumoPorCliente[b.id];
            const atrasoA = ra ? ra.atraso : 0, atrasoB = rb ? rb.atraso : 0;
            if (atrasoA !== atrasoB) { return atrasoB - atrasoA; }
            const abertoA = ra ? ra.aberto : 0, abertoB = rb ? rb.aberto : 0;
            if (abertoA !== abertoB) { return abertoB - abertoA; }
            return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
        });
    }

    function renderTabela() {
        const linhas = linhasFiltradas();
        el("carnes-count").textContent =
            linhas.length + (linhas.length === 1 ? " CLIENTE" : " CLIENTES");

        if (!linhas.length) {
            const msg = filtro === "sem"
                ? "Nenhum cliente com dívida está sem carnê."
                : filtro === "carnes"
                    ? "Nenhum carnê encontrado."
                    : "Nenhum cliente encontrado.";
            el("carnes-table").innerHTML =
                '<tr><td colspan="7" class="empty">' + msg + "</td></tr>";
            return;
        }

        el("carnes-table").innerHTML = linhas.map(c => {
            const r = resumoPorCliente[c.id];
            const carne = carnesPorCliente[c.id];
            const aberto = r ? fmtMoney(r.aberto) : '<span class="valor-zero">R$ 0,00</span>';
            const atrasadas = r && r.nAtraso
                ? statusHTML("atrasada", r.nAtraso + (r.nAtraso === 1 ? " parcela" : " parcelas"))
                : '<span class="valor-zero">—</span>';
            const proximo = r && r.proximo ? dateBR(r.proximo) : "—";
            const situacao = carne
                ? statusHTML("ativo", "Ativo")
                : statusHTML("semcarne", "Sem carnê");

            const acoes = carne
                ? '<button class="btn btn-primary" data-acao="ver" data-id="' + escapar(c.id) + '">Ver carnê</button>' +
                  '<button class="btn" data-acao="copiar" data-id="' + escapar(c.id) + '">Copiar link</button>' +
                  '<button class="btn" data-acao="pdf" data-id="' + escapar(c.id) + '"' +
                  (r ? "" : " disabled title=\"Sem parcelas em aberto\"") + '>PDF</button>'
                : '<button class="btn btn-primary" data-acao="gerar" data-id="' + escapar(c.id) + '">Gerar carnê</button>';

            return "<tr>" +
                '<td class="carnes-nome"><strong>' + escapar(c.nome) + "</strong>" +
                (c.cpf_cnpj ? "<small>" + escapar(maskDoc(c.cpf_cnpj)) + "</small>" : "") + "</td>" +
                "<td>" + escapar(c.telefone ? maskPhone(c.telefone) : "—") + "</td>" +
                "<td>" + aberto + "</td>" +
                "<td>" + atrasadas + "</td>" +
                "<td>" + proximo + "</td>" +
                "<td>" + situacao + "</td>" +
                '<td><div class="carnes-acoes">' + acoes + "</div></td>" +
                "</tr>";
        }).join("");
    }

    async function tratarAcao(botao) {
        const id = botao.dataset.id;
        const acao = botao.dataset.acao;
        const carne = carnesPorCliente[id];

        try {
            if (acao === "copiar") {
                const link = linkDoCarne(carne.codigo_acesso);
                try {
                    await navigator.clipboard.writeText(link);
                    toast("Link do carnê copiado.", "info");
                } catch (e) {
                    window.prompt("Copie o link do carnê:", link);
                }
                return;
            }
            if (typeof window.gerarCarneCliente !== "function") {
                throw new Error("Módulo de carnê não carregado.");
            }
            await window.gerarCarneCliente(id, acao === "pdf" ? "pdf" : null);
        } catch (erro) {
            console.error("[carnes] ação:", erro);
            toast((erro && erro.message) || "Não foi possível abrir o carnê.", "error");
        }
    }

    function iniciar() {
        el("carnes-table").addEventListener("click", evento => {
            const botao = evento.target.closest("button[data-acao]");
            if (botao && !botao.disabled) {
                tratarAcao(botao);
            }
        });

        el("carnes-search").addEventListener("input", evento => {
            busca = evento.target.value;
            renderTabela();
        });

        document.querySelectorAll(".carnes-tab").forEach(aba => {
            aba.addEventListener("click", () => {
                filtro = aba.dataset.filtro;
                document.querySelectorAll(".carnes-tab").forEach(a =>
                    a.classList.toggle("active", a === aba));
                renderTabela();
            });
        });

        /* quando um carnê é criado no modal, atualiza a lista */
        window.aoAtualizarCarne = () => { carregar(); };

        carregar();
    }

    iniciar();
})();
