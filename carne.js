/* =========================================================
   CARNÊ — integração com o sistema da loja

   Expõe window.gerarCarneVenda(vendaId), chamado pelo botão
   CARNÊ de "Contas a receber" (receber.js).

   - Cria (ou reaproveita) o carnê digital do cliente da venda.
   - Os links são os mesmos do sistema de carnês anterior:
       /?carne=CODIGO   (carnê digital)
       /?token=TOKEN    (pagamento de parcela / cobrança antiga)
     Clientes que já têm carnê mantêm o mesmo link.
   - Gera o PDF para impressão (QR Code aponta para o carnê digital).

   Requer: supabase.js/auth.js (sessão), qrcodejs e jsPDF
   (já carregados em receber.html) e a API /api/cobranca.
========================================================= */
(function () {
    "use strict";

    /* ---------- Funções do gerador original (sem alterações) ---------- */

    function formatarCpfCnpj(valor){

        let n = String(valor || "")
            .replace(/\D/g,"")
            .slice(0,14);

        if(n.length <= 11){

            if(n.length <= 3){
                return n;
            }

            if(n.length <= 6){
                return n.replace(
                    /(\d{3})(\d+)/,
                    "$1.$2"
                );
            }

            if(n.length <= 9){
                return n.replace(
                    /(\d{3})(\d{3})(\d+)/,
                    "$1.$2.$3"
                );
            }

            return n.replace(
                /(\d{3})(\d{3})(\d{3})(\d{1,2})/,
                "$1.$2.$3-$4"
            );
        }

        return n.replace(
            /(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,
            function(_,a,b,c,d,e){
                return a+"."+b+"."+c+"/"+d+
                    (e ? "-"+e : "");
            }
        );
    }


    /* =========================================================
       FORMATAÇÃO TELEFONE
    ========================================================= */

    function formatarTelefone(valor){

        let n = String(valor || "")
            .replace(/\D/g,"")
            .slice(0,11);

        if(!n){
            return "";
        }

        if(n.length <= 2){
            return "(" + n;
        }

        if(n.length <= 6){
            return "(" + n.slice(0,2) + ") " +
                n.slice(2);
        }

        if(n.length <= 10){
            return "(" + n.slice(0,2) + ") " +
                n.slice(2,6) + "-" +
                n.slice(6);
        }

        return "(" + n.slice(0,2) + ") " +
            n.slice(2,7) + "-" +
            n.slice(7);
    }

    function formatarMoeda(valor){

        return Number(valor || 0).toLocaleString(
            "pt-BR",
            {
                style:"currency",
                currency:"BRL"
            }
        );
    }


    /* =========================================================
       DATA
    ========================================================= */

    function formatarData(data){

        if(!data){
            return "";
        }

        const partes = data.split("-");

        if(partes.length !== 3){
            return data;
        }

        return partes[2] + "/" +
            partes[1] + "/" +
            partes[0];
    }


    /* =========================================================
       ADICIONAR MESES
    ========================================================= */

    function carregarImagemLogo(){

        return new Promise(
            function(resolve,reject){

                const imagem = new Image();

                imagem.onload = function(){

                    const canvas =
                        document.createElement("canvas");

                    canvas.width =
                        imagem.naturalWidth;

                    canvas.height =
                        imagem.naturalHeight;

                    const ctx =
                        canvas.getContext("2d");

                    ctx.drawImage(
                        imagem,
                        0,
                        0
                    );

                    resolve(
                        canvas.toDataURL("image/png")
                    );
                };

                imagem.onerror = function(){

                    reject(
                        "Não foi possível carregar logo-carne.png"
                    );
                };

                imagem.src = "logo-carne.png";
            }
        );
    }


    /* =========================================================
       CRIAR TOKEN SEGURO
    ========================================================= */

    async function gerarImagemQR(texto){

        return new Promise(
            function(resolve,reject){

                const div =
                    document.createElement("div");

                div.style.position = "absolute";
                div.style.left = "-99999px";

                document.body.appendChild(div);

                try{

                    new QRCode(
                        div,
                        {
                            text:texto,
                            width:400,
                            height:400,
                            correctLevel:
                                QRCode.CorrectLevel.M
                        }
                    );

                }catch(e){

                    document.body.removeChild(div);
                    reject(e);
                    return;
                }

                setTimeout(
                    function(){

                        const canvas =
                            div.querySelector("canvas");

                        if(!canvas){

                            document.body.removeChild(div);

                            reject(
                                "Não foi possível gerar o QR Code."
                            );

                            return;
                        }

                        const imagem =
                            canvas.toDataURL("image/png");

                        document.body.removeChild(div);

                        resolve(imagem);

                    },
                    300
                );
            }
        );
    }


    /* =========================================================
       DESENHAR PARCELA
       A4 HORIZONTAL
    ========================================================= */

    function desenharParcela(
        pdf,
        dados,
        qrImagem,
        numero,
        totalParcelas,
        y,
        logo
    ){

        const x = 8;
        const largura = 281;
        const altura = 95;

        /*
            DIVISÃO PRINCIPAL

            ESQUERDA = PAGAMENTO
            DIREITA  = CLIENTE
        */

        const divisaoX = x + 190;


        /* ==========================================
           BORDA EXTERNA
        ========================================== */

        pdf.setDrawColor(35,35,35);
        pdf.setLineWidth(.5);

        pdf.roundedRect(
            x,
            y,
            largura,
            altura,
            2,
            2
        );


        /* ==========================================
           DIVISÃO VERTICAL
        ========================================== */

        pdf.setDrawColor(100,100,100);
        pdf.setLineWidth(.4);

        pdf.line(
            divisaoX,
            y,
            divisaoX,
            y + altura
        );


        /* ==========================================
           LOGO
        ========================================== */

        try{

            pdf.addImage(
                logo,
                "PNG",
                x + 5,
                y + 5,
                40,
                15
            );

        }catch(e){}


        /* ==========================================
           TÍTULO
        ========================================== */

        pdf.setTextColor(20,20,20);

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(15);

        pdf.text(
            "CARNÊ DE PAGAMENTO",
            x + 105,
            y + 12,
            {
                align:"center"
            }
        );


        /* ==========================================
           PARCELA
        ========================================== */

        pdf.setFontSize(10);

        pdf.text(
            "PARCELA " +
            numero +
            "/" +
            totalParcelas,
            divisaoX - 5,
            y + 10,
            {
                align:"right"
            }
        );


        /* ==========================================
           LINHA DO CABEÇALHO
        ========================================== */

        pdf.setDrawColor(100,100,100);

        pdf.line(
            x + 5,
            y + 22,
            divisaoX - 5,
            y + 22
        );


        /* =====================================================
           ESQUERDA — INFORMAÇÕES DE PAGAMENTO
        ===================================================== */


        /* ==========================================
           VENCIMENTO
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(8);

        pdf.text(
            "VENCIMENTO",
            x + 7,
            y + 31
        );

        pdf.setFontSize(13);

        pdf.text(
            formatarData(
                dados.vencimento
            ),
            x + 7,
            y + 39
        );


        /* ==========================================
           VALOR
        ========================================== */

        pdf.setFontSize(8);

        pdf.text(
            "VALOR DA PARCELA",
            x + 75,
            y + 31
        );

        pdf.setFontSize(15);

        pdf.text(
            formatarMoeda(
                dados.valor
            ),
            x + 75,
            y + 39
        );


        /* ==========================================
           PAGAMENTO VIA PIX
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(9);

        pdf.text(
            "PAGAMENTO VIA PIX",
            x + 7,
            y + 49
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.setFontSize(7.5);

        pdf.text(
            "Aponte a câmera para o QR Code",
            x + 7,
            y + 56
        );

        pdf.text(
            "para consultar e pagar esta parcela.",
            x + 7,
            y + 62
        );


        /* ==========================================
           QR CODE
        ========================================== */

        pdf.addImage(
            qrImagem,
            "PNG",
            x + 145,
            y + 47,
            38,
            38
        );


        /* ==========================================
           TEXTO AO LADO DO QR
        ========================================== */

        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.setFontSize(6.5);

        pdf.text(
            "Escaneie para acessar",
            x + 164,
            y + 88,
            {
                align:"center"
            }
        );

        pdf.text(
            "a página de pagamento.",
            x + 164,
            y + 92,
            {
                align:"center"
            }
        );


        /* ==========================================
           AVISO
        ========================================== */

        pdf.setFontSize(6.5);

        pdf.text(
            "Valor atualizado automaticamente em caso de atraso.",
            x + 7,
            y + 88
        );


        /* =====================================================
           DIREITA — DADOS DO CLIENTE
        ===================================================== */

        const clienteX =
            divisaoX + 7;

        const clienteDireita =
            x + largura - 7;

        const clienteLargura =
            clienteDireita - clienteX;


        /* ==========================================
           TÍTULO DO QUADRO
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(11);

        pdf.text(
            "DADOS DO CLIENTE",
            clienteX,
            y + 11
        );


        /* ==========================================
           LINHA DO TÍTULO
        ========================================== */

        pdf.setDrawColor(120,120,120);

        pdf.line(
            clienteX,
            y + 16,
            clienteDireita,
            y + 16
        );


        /* ==========================================
           CLIENTE
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(7);

        pdf.text(
            "CLIENTE",
            clienteX,
            y + 24
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.setFontSize(9);

        const nome =
            dados.cliente || "-";

        const nomeLinhas =
            pdf.splitTextToSize(
                nome,
                clienteLargura
            );


        pdf.text(
            nomeLinhas.slice(0,1),
            clienteX,
            y + 30
        );


        /* ==========================================
           CPF / CNPJ
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(7);

        pdf.text(
            "CPF / CNPJ",
            clienteX,
            y + 40
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.setFontSize(9);

        pdf.text(
            formatarCpfCnpj(
                dados.cpf
            ) || "-",
            clienteX,
            y + 46
        );


        /* ==========================================
           ENDEREÇO
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(7);

        pdf.text(
            "ENDEREÇO",
            clienteX,
            y + 56
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.setFontSize(8.5);

        const endereco =
            dados.endereco || "-";


        const enderecoLinhas =
            pdf.splitTextToSize(
                endereco,
                clienteLargura
            );


        /*
            Até 2 linhas.
            O telefone ficará abaixo.
        */

        pdf.text(
            enderecoLinhas.slice(0,2),
            clienteX,
            y + 63
        );


        /* ==========================================
           TELEFONE
           ABAIXO DO ENDEREÇO
        ========================================== */

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(7);

        pdf.text(
            "TELEFONE",
            clienteX,
            y + 76
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.setFontSize(9);

        pdf.text(
            formatarTelefone(
                dados.telefone
            ) || "-",
            clienteX,
            y + 82
        );


        /* ==========================================
           LINHA DO RODAPÉ
        ========================================== */

        pdf.setDrawColor(180,180,180);

        pdf.line(
            clienteX,
            y + 86,
            clienteDireita,
            y + 86
        );


        /* ==========================================
           RODAPÉ DO QUADRO
        ========================================== */

        pdf.setTextColor(20,20,20);

        pdf.setFont(
            "helvetica",
            "bold"
        );

        pdf.setFontSize(6.5);

        pdf.text(
            "EDILMA BOUTIQUE",
            clienteX,
            y + 91
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );

        pdf.text(
            "Tel.: (43) 9 9678-8303",
            clienteDireita,
            y + 91,
            {
                align:"right"
            }
        );
    }

    /* =========================================================
       GERAR CARNÊ
    ========================================================= */

    /* =========================================================
       NOVO — INTEGRAÇÃO COM O SISTEMA DA LOJA
       (usa a sessão do Supabase já aberta pelo login do sistema)
    ========================================================= */

    const API_COBRANCA = "/api/cobranca";

    function esc(valor) {
        return String(valor == null ? "" : valor)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function aviso(mensagem, tipo) {
        if (typeof window.toast === "function") {
            window.toast(mensagem, tipo || "info");
        } else {
            alert(mensagem);
        }
    }

    function clienteSupabase() {
        if (!window.SUPABASE_CONFIGURED || !window.supabaseClient) {
            throw new Error(
                "Supabase não configurado. Preencha js/supabase.js."
            );
        }
        return window.supabaseClient;
    }

    async function tokenDeSessao() {
        const { data, error } =
            await clienteSupabase().auth.getSession();
        if (error) {
            throw error;
        }
        const token = data && data.session && data.session.access_token;
        if (!token) {
            throw new Error(
                "Sua sessão expirou. Entre novamente no sistema."
            );
        }
        return token;
    }

    /*
        Chamada à API do carnê com o token de sessão.
        O CARNE_SECRET e a chave de serviço ficam só no servidor.
    */
    async function chamarApi(acao, corpo) {
        const token = await tokenDeSessao();

        let resposta;
        try {
            resposta = await fetch(API_COBRANCA, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify(Object.assign({ acao: acao }, corpo))
            });
        } catch (erro) {
            throw new Error(
                "Não foi possível falar com o servidor do carnê."
            );
        }

        let dados = null;
        try {
            dados = await resposta.json();
        } catch (erro) {
            dados = null;
        }

        if (!resposta.ok || !dados) {
            if (resposta.status === 404 || !dados) {
                throw new Error(
                    "A API do carnê (/api/cobranca) não está disponível " +
                    "neste endereço. Abra o sistema pelo endereço publicado no Vercel."
                );
            }
            throw new Error(
                dados.erro || "Não foi possível concluir a operação do carnê."
            );
        }

        return dados;
    }

    async function carregarContexto(vendaId) {
        const db = clienteSupabase();

        const vendaRes = await db
            .from("vendas")
            .select("id,cliente_id,descricao,valor_total,quantidade_parcelas,status")
            .eq("id", vendaId)
            .maybeSingle();
        if (vendaRes.error) {
            throw vendaRes.error;
        }
        const venda = vendaRes.data;
        if (!venda) {
            throw new Error("Venda não encontrada.");
        }
        if (!venda.cliente_id) {
            throw new Error(
                "Esta venda não tem cliente. O carnê é emitido por cliente."
            );
        }

        const clienteRes = await db
            .from("clientes")
            .select("id,nome,cpf_cnpj,telefone,endereco")
            .eq("id", venda.cliente_id)
            .maybeSingle();
        if (clienteRes.error) {
            throw clienteRes.error;
        }
        const cliente = clienteRes.data;
        if (!cliente) {
            throw new Error("Cliente da venda não encontrado.");
        }

        const existente = await chamarApi("consultarCarne", {
            clienteId: cliente.id
        });

        /*
            Chaves PIX cadastradas (tabela chaves_pix). Se a tabela
            não puder ser lida, o operador ainda pode digitar a chave.
        */
        let chavesPix = [];
        const pixRes = await db
            .from("chaves_pix")
            .select("*")
            .eq("ativo", true)
            .order("nome", { ascending: true });
        if (pixRes.error) {
            console.warn("[carne] chaves_pix indisponível:", pixRes.error);
        } else {
            chavesPix = pixRes.data || [];
        }

        return {
            venda: venda,
            cliente: cliente,
            carne: existente.carne || null,
            link: existente.link || null,
            chavesPix: chavesPix
        };
    }

    /*
        Contexto por CLIENTE (aba Carnês): não depende de uma venda.
        O carnê é um só por cliente e mostra todas as parcelas dele.
    */
    async function carregarContextoCliente(clienteId) {
        const db = clienteSupabase();

        const clienteRes = await db
            .from("clientes")
            .select("id,nome,cpf_cnpj,telefone,endereco")
            .eq("id", clienteId)
            .maybeSingle();
        if (clienteRes.error) {
            throw clienteRes.error;
        }
        const cliente = clienteRes.data;
        if (!cliente) {
            throw new Error("Cliente não encontrado.");
        }

        const existente = await chamarApi("consultarCarne", {
            clienteId: cliente.id
        });

        let chavesPix = [];
        const pixRes = await db
            .from("chaves_pix")
            .select("*")
            .eq("ativo", true)
            .order("nome", { ascending: true });
        if (pixRes.error) {
            console.warn("[carne] chaves_pix indisponível:", pixRes.error);
        } else {
            chavesPix = pixRes.data || [];
        }

        return {
            venda: null,
            cliente: cliente,
            carne: existente.carne || null,
            link: existente.link || null,
            chavesPix: chavesPix
        };
    }

    /* ---------- PDF para impressão ---------- */

    async function gerarPdfDaVenda(ctx) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error("Biblioteca de PDF não carregada.");
        }
        if (typeof QRCode === "undefined") {
            throw new Error("Biblioteca de QR Code não carregada.");
        }
        if (!ctx.link) {
            throw new Error("Crie o carnê digital antes de gerar o PDF.");
        }

        /*
            Com venda: parcelas daquela venda (comportamento original).
            Sem venda (aba Carnês): parcelas em aberto de todas as vendas
            ativas do cliente; numeração "n/total" é a de cada venda.
        */
        let todas = [];
        let totalPorVenda = {};
        if (ctx.venda) {
            const parcelasRes = await clienteSupabase()
                .from("parcelas")
                .select("id,venda_id,numero,valor,valor_pago,vencimento,status")
                .eq("venda_id", ctx.venda.id)
                .order("numero", { ascending: true });
            if (parcelasRes.error) {
                throw parcelasRes.error;
            }
            todas = parcelasRes.data || [];
            totalPorVenda[ctx.venda.id] = todas.length;
        } else {
            const parcelasRes = await clienteSupabase()
                .from("parcelas")
                .select("id,venda_id,numero,valor,valor_pago,vencimento,status,vendas!inner(cliente_id,status)")
                .eq("vendas.cliente_id", ctx.cliente.id)
                .neq("vendas.status", "cancelada")
                .order("vencimento", { ascending: true })
                .order("numero", { ascending: true });
            if (parcelasRes.error) {
                throw parcelasRes.error;
            }
            todas = parcelasRes.data || [];
            todas.forEach(function (p) {
                totalPorVenda[p.venda_id] =
                    (totalPorVenda[p.venda_id] || 0) + 1;
            });
        }
        const abertas = todas.filter(function (p) {
            return (
                p.status !== "paga" &&
                Number(p.valor || 0) - Number(p.valor_pago || 0) > 0
            );
        });
        if (!abertas.length) {
            throw new Error(
                ctx.venda
                    ? "Esta venda não tem parcelas em aberto para imprimir."
                    : "Este cliente não tem parcelas em aberto para imprimir."
            );
        }

        const jsPDF = window.jspdf.jsPDF;
        const logo = await carregarImagemLogo();
        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4"
        });

        /*
            O QR aponta para o carnê digital do cliente (o mesmo link
            enviado por mensagem). Assim a parcela sempre aparece com
            o valor e a situação atuais, mesmo se paga depois de impressa.
        */
        const qrImagem = await gerarImagemQR(ctx.link);

        for (let i = 0; i < abertas.length; i++) {
            if (i > 0 && i % 2 === 0) {
                pdf.addPage();
            }
            const posicao = i % 2;
            const y = posicao === 0 ? 5 : 110;
            const parcela = abertas[i];

            desenharParcela(
                pdf,
                {
                    cliente: ctx.cliente.nome || "",
                    cpf: ctx.cliente.cpf_cnpj || "",
                    telefone: ctx.cliente.telefone || "",
                    endereco: ctx.cliente.endereco || "",
                    vencimento: parcela.vencimento,
                    valor: Number(parcela.valor || 0) -
                           Number(parcela.valor_pago || 0)
                },
                qrImagem,
                parcela.numero,
                totalPorVenda[parcela.venda_id] || todas.length,
                y,
                logo
            );

            if (posicao === 0) {
                pdf.setDrawColor(120, 120, 120);
                pdf.setLineDashPattern([3, 2], 0);
                pdf.line(8, 105, 289, 105);
                pdf.setLineDashPattern([], 0);
            }
        }

        const nomeArquivo =
            "Carne-" +
            String(ctx.cliente.nome || "cliente")
                .replace(/[^a-zA-Z0-9À-ÿ ]/g, "")
                .replace(/\s+/g, "-") +
            ".pdf";
        pdf.save(nomeArquivo);
    }

    /* ---------- MODAL ---------- */

    function injetarEstilos() {
        if (document.getElementById("carne-modal-css")) {
            return;
        }
        const css = document.createElement("style");
        css.id = "carne-modal-css";
        css.textContent =
            ".carne-modal-card{width:min(560px,100%)}" +
            ".carne-modal-txt{color:var(--muted);line-height:1.6;margin:0 0 16px;font-size:14px}" +
            ".carne-modal-txt b{color:var(--text)}" +
            ".carne-link-row{display:flex;gap:8px;align-items:stretch}" +
            ".carne-link-row input{flex:1;min-width:0;border:1px solid var(--line);border-radius:6px;background:#121416;color:var(--text);padding:11px 12px}" +
            ".carne-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}" +
            ".carne-pix-info{font-size:12px;color:var(--muted);margin-top:6px}";
        document.head.appendChild(css);
    }

    function fecharModal() {
        const existente = document.getElementById("carne-modal");
        if (existente) {
            existente.remove();
        }
        document.removeEventListener("keydown", aoTeclar);
    }

    function aoTeclar(evento) {
        if (evento.key === "Escape") {
            fecharModal();
        }
    }

    function linkWhatsApp(ctx) {
        let numero = String(ctx.cliente.telefone || "").replace(/\D/g, "");
        if (!numero) {
            return null;
        }
        if (numero.length <= 11) {
            numero = "55" + numero;
        }
        const primeiro =
            String(ctx.cliente.nome || "").trim().split(/\s+/)[0] || "";
        const texto =
            "Olá" + (primeiro ? ", " + primeiro : "") +
            "! Segue o link do seu carnê da Edilma Boutique: " + ctx.link;
        return "https://wa.me/" + numero + "?text=" + encodeURIComponent(texto);
    }

    function desenharModal(ctx) {
        injetarEstilos();
        fecharModal();

        const overlay = document.createElement("div");
        overlay.className = "modal";
        overlay.id = "carne-modal";

        const temCarne = Boolean(ctx.carne && ctx.link);
        const zap = temCarne ? linkWhatsApp(ctx) : null;

        let corpo;
        if (temCarne) {
            corpo =
                '<p class="carne-modal-txt">Carnê digital de <b>' + esc(ctx.cliente.nome) +
                '</b>. O link mostra todas as parcelas do cliente, sempre atualizadas.</p>' +
                '<div class="field"><label>Link do carnê</label>' +
                '<div class="carne-link-row">' +
                '<input id="carne-link" readonly value="' + esc(ctx.link) + '">' +
                '<button class="btn" id="carne-copiar" type="button">Copiar</button>' +
                '</div></div>' +
                '<div class="carne-acoes">' +
                '<a class="btn btn-primary" id="carne-abrir" href="' + esc(ctx.link) + '" target="_blank" rel="noopener">Abrir carnê</a>' +
                (zap
                    ? '<a class="btn" id="carne-zap" href="' + esc(zap) + '" target="_blank" rel="noopener">Enviar por WhatsApp</a>'
                    : '') +
                '<button class="btn" id="carne-pdf" type="button">Baixar PDF para impressão</button>' +
                '</div>';
        } else {
            const opcoes = ctx.chavesPix.map(function (pix) {
                return '<option value="' + esc(pix.id) + '">' +
                    esc(pix.nome || pix.chave || "Chave PIX") + '</option>';
            }).join("");

            const campoPix = ctx.chavesPix.length
                ? '<div class="field full"><label>Chave PIX do carnê</label>' +
                  '<select id="carne-pix"><option value="">Selecione uma chave PIX...</option>' +
                  opcoes + '</select>' +
                  '<div class="carne-pix-info" id="carne-pix-info"></div></div>'
                : '<div class="field full"><label>Chave PIX do carnê</label>' +
                  '<input id="carne-pix-manual" placeholder="Nenhuma chave cadastrada — digite a chave PIX">' +
                  '</div>';

            corpo =
                '<p class="carne-modal-txt"><b>' + esc(ctx.cliente.nome) +
                '</b> ainda não possui carnê digital. Ao criar, será gerado um link único com todas as parcelas do cliente.</p>' +
                '<div class="form-grid">' + campoPix +
                '<div class="field"><label>Multa por atraso (%)</label>' +
                '<input id="carne-multa" type="number" step="0.01" min="0" value="2"></div>' +
                '<div class="field"><label>Juros ao dia (%)</label>' +
                '<input id="carne-juros" type="number" step="0.001" min="0" value="0.033"></div>' +
                '</div>' +
                '<div class="carne-acoes">' +
                '<button class="btn btn-primary" id="carne-criar" type="button">Criar carnê</button>' +
                '<button class="btn btn-ghost" id="carne-cancelar" type="button">Cancelar</button>' +
                '</div>';
        }

        overlay.innerHTML =
            '<div class="modal-card carne-modal-card" role="dialog" aria-modal="true">' +
            '<div class="modal-head"><h3>' + (temCarne ? "Carnê do cliente" : "Criar carnê") + '</h3>' +
            '<button class="icon-btn" id="carne-fechar" type="button" aria-label="Fechar">×</button></div>' +
            corpo + '</div>';

        document.body.appendChild(overlay);
        document.addEventListener("keydown", aoTeclar);

        overlay.addEventListener("click", function (evento) {
            if (evento.target === overlay) {
                fecharModal();
            }
        });
        overlay.querySelector("#carne-fechar").onclick = fecharModal;

        if (temCarne) {
            overlay.querySelector("#carne-copiar").onclick = async function () {
                try {
                    await navigator.clipboard.writeText(ctx.link);
                    aviso("Link do carnê copiado.", "info");
                } catch (erro) {
                    const campo = overlay.querySelector("#carne-link");
                    campo.select();
                    aviso("Copie o link selecionado (Ctrl+C).", "info");
                }
            };

            overlay.querySelector("#carne-pdf").onclick = async function (evento) {
                const botao = evento.currentTarget;
                const texto = botao.textContent;
                botao.disabled = true;
                botao.textContent = "Gerando PDF...";
                try {
                    await gerarPdfDaVenda(ctx);
                } catch (erro) {
                    console.error("[carne] PDF:", erro);
                    aviso(
                        (erro && erro.message) ||
                        (typeof erro === "string" ? erro : "Não foi possível gerar o PDF."),
                        "error"
                    );
                } finally {
                    botao.disabled = false;
                    botao.textContent = texto;
                }
            };
            /* Veio de "Gerar carnê (PDF)" na tela de vendas: baixa o PDF direto. */
            if (ctx.intent === "pdf") {
                ctx.intent = null;
                overlay.querySelector("#carne-pdf").click();
            }
            return;
        }

        /* ----- criar carnê ----- */
        overlay.querySelector("#carne-cancelar").onclick = fecharModal;

        const select = overlay.querySelector("#carne-pix");
        if (select) {
            select.onchange = function () {
                const pix = ctx.chavesPix.find(function (item) {
                    return String(item.id) === String(select.value);
                });
                overlay.querySelector("#carne-pix-info").textContent = pix
                    ? [pix.banco, pix.tipo, pix.chave].filter(Boolean).join(" · ")
                    : "";
            };
        }

        overlay.querySelector("#carne-criar").onclick = async function (evento) {
            const botao = evento.currentTarget;

            let chave = "";
            if (select) {
                const pix = ctx.chavesPix.find(function (item) {
                    return String(item.id) === String(select.value);
                });
                chave = pix ? String(pix.chave || "").trim() : "";
            } else {
                chave = String(
                    overlay.querySelector("#carne-pix-manual").value || ""
                ).trim();
            }
            if (!chave) {
                aviso("Informe a chave PIX do carnê.", "error");
                return;
            }

            const multa = Number(overlay.querySelector("#carne-multa").value);
            const juros = Number(overlay.querySelector("#carne-juros").value);
            if (!Number.isFinite(multa) || multa < 0 ||
                !Number.isFinite(juros) || juros < 0) {
                aviso("Multa e juros devem ser números maiores ou iguais a zero.", "error");
                return;
            }

            botao.disabled = true;
            botao.textContent = "Criando carnê...";
            try {
                const resultado = await chamarApi("criarCarne", {
                    clienteId: ctx.cliente.id,
                    vendaId: ctx.venda ? ctx.venda.id : null,
                    multa: multa,
                    juros: juros,
                    pix: chave
                });
                ctx.carne = resultado.carne;
                ctx.link = resultado.link;
                if (typeof window.aoAtualizarCarne === "function") {
                    try { window.aoAtualizarCarne(ctx); } catch (e) { console.warn(e); }
                }
                aviso(
                    resultado.nova
                        ? "Carnê criado."
                        : "Este cliente já tinha carnê; o link existente foi mantido.",
                    "info"
                );
                desenharModal(ctx);
            } catch (erro) {
                console.error("[carne] criar:", erro);
                aviso(erro.message || "Não foi possível criar o carnê.", "error");
                botao.disabled = false;
                botao.textContent = "Criar carnê";
            }
        };
    }

    /*
        Chamado pelo botão CARNÊ de Contas a receber (receber.js).
    */
    window.gerarCarneVenda = async function (vendaId, intencao) {
        if (!vendaId) {
            throw new Error("Venda não identificada.");
        }
        const ctx = await carregarContexto(vendaId);
        ctx.intent = intencao || null; /* "pdf" | "link" | null */
        desenharModal(ctx);
    };

    /*
        Chamado pela aba CARNÊS: abre o carnê de um cliente (cria se não
        existir, ou mostra o link de sempre). intencao: "pdf" | "link".
    */
    window.gerarCarneCliente = async function (clienteId, intencao) {
        if (!clienteId) {
            throw new Error("Cliente não identificado.");
        }
        const ctx = await carregarContextoCliente(clienteId);
        ctx.intent = intencao || null;
        desenharModal(ctx);
    };

    /*
        Tela de VENDAS: depois da pergunta do comprovante, se a venda for
        no crediário / cartão da loja (tem parcelas em aberto e cliente),
        pergunta se quer enviar o link do carnê ou gerar o carnê em PDF.
        Chamado por receipt.js (offerSaleReceipt).
    */
    window.offerSaleCarne = function (venda) {
        if (!venda || !venda.id || !venda.cliente_id) {
            return;
        }
        const temAberta = (venda.parcelas || []).some(function (p) {
            return p.status !== "paga";
        });
        if (!temAberta) {
            return;
        }

        const anterior = document.getElementById("sale-carne-prompt");
        if (anterior) {
            anterior.remove();
        }

        const nome = esc(venda.cliente_nome || "o cliente");
        const caixa = document.createElement("div");
        caixa.id = "sale-carne-prompt";
        caixa.innerHTML =
            '<div class="receipt-prompt-backdrop"><section class="receipt-prompt-card" role="dialog" aria-modal="true" style="width:min(540px,100%)">' +
            "<h2>Carnê do cliente</h2>" +
            "<p>Deseja enviar o link do carnê ou gerar o carnê de <b>" + nome + "</b> agora?</p>" +
            '<div class="receipt-prompt-actions">' +
            '<button type="button" class="btn btn-ghost" data-carne-fechar>Agora não</button>' +
            '<button type="button" class="btn" data-carne-pdf>Gerar carnê (PDF)</button>' +
            '<button type="button" class="btn btn-primary" data-carne-link>Enviar link do carnê</button>' +
            "</div></section></div>";
        document.body.appendChild(caixa);

        function abrir(intencao) {
            caixa.remove();
            window.gerarCarneVenda(venda.id, intencao).catch(function (erro) {
                console.error("[carne] venda:", erro);
                aviso(
                    (erro && erro.message) || "Não foi possível abrir o carnê.",
                    "error"
                );
            });
        }
        caixa.querySelector("[data-carne-fechar]").onclick = function () { caixa.remove(); };
        caixa.querySelector("[data-carne-link]").onclick = function () { abrir("link"); };
        caixa.querySelector("[data-carne-pdf]").onclick = function () { abrir("pdf"); };
    };

})();
