# SISTEMA ZER01 — arquivos-fonte

Este pacote é uma implementação em **HTML, CSS e JavaScript puro**, preparada para Supabase Authentication e PostgreSQL. Não há Next.js, cadastro de produtos, estoque, entrada ou valor restante.

## Configuração

1. Abra `js/supabase.js`.
2. Substitua `COLE_AQUI_A_URL_DO_SEU_PROJETO_SUPABASE` pela URL do seu projeto.
3. Substitua `COLE_AQUI_A_CHAVE_PUBLICA_ANON_OU_PUBLISHABLE` pela chave pública do Supabase.
4. Execute `supabase/schema.sql` no SQL Editor do Supabase.
5. Crie usuários em Authentication > Users.
6. Sirva esta pasta por um servidor HTTP local, por exemplo `python3 -m http.server 8080`.

Nunca coloque a `service_role key`, senha, token privado ou credencial bancária no frontend. A integração PIX e a geração de carnê ficam preparadas no modelo de dados para uma etapa posterior com backend seguro/webhook.

## Arquivos principais

| Área | Arquivos |
|---|---|
| Páginas | `login.html`, `dashboard.html`, `clientes.html`, `vendas.html`, `receber.html`, `pagamentos.html`, `relatorios.html`, `configuracoes.html` |
| Estilos | `css/global.css` e arquivos CSS específicos por página |
| JavaScript | `js/supabase.js`, `auth.js`, `app.js` e módulos de cada página |
| Banco | `supabase/schema.sql` |

As credenciais precisam ser preenchidas antes de usar o sistema. O frontend não usa `localStorage` como banco alternativo: sem uma URL e uma chave pública válidas, as consultas e gravações são bloqueadas e uma mensagem de erro é exibida. Depois da configuração, clientes, vendas, parcelas, pagamentos, dashboard e relatórios consultam diretamente as tabelas do Supabase.

## Atualização: vendas à vista

- **Instalação nova:** execute `supabase/schema.sql` normalmente.
- **Sistema já em uso:** execute `supabase/migration_vendas_a_vista.sql` no SQL Editor do Supabase antes de publicar os arquivos atualizados. A migração permite `cliente_id` nulo e adiciona `vendas.forma_pagamento`, sem apagar as vendas existentes.
- Na tela **Nova venda**, selecione **À vista** para escolher dinheiro, PIX, cartão de débito, cartão de crédito à vista ou transferência. O cliente é opcional e a venda fica quitada no histórico.
- Selecione **Crediário / fiado** para exigir um cliente e configurar as parcelas como antes.

## Comprovantes de venda (impressora térmica 58 mm)

O sistema permite imprimir um comprovante interno, não fiscal, para vendas à vista e no crediário. Após salvar uma venda, use **Imprimir comprovante**; no histórico, o botão **Imprimir** permite emitir uma segunda via. O layout é otimizado para bobina de 58 mm. Para funcionar, permita pop-ups/impressão no navegador.

Antes de usar a versão atualizada, execute no SQL Editor do Supabase o arquivo `supabase/migration_vendas_a_vista.sql`. A migração inclui `itens_json`, que guarda uma cópia dos itens, quantidades e valores para permitir a reimpressão do comprovante. Vendas antigas sem esse snapshot continuarão imprimindo o resumo textual já salvo.

**Importante:** este comprovante é apenas um registro interno e não substitui NFC-e ou outro documento fiscal obrigatório.


## Cartão da loja (crediário com leitura de cartão)

- **Instalação:** execute `supabase/migration_cartao_loja.sql` no SQL Editor do Supabase (depois de `migration_zer01_score.sql`).
- Os cartões continuam sendo emitidos em **Zer01 Score**; o código do cartão (código de barras CODE128) identifica o cliente.
- Em **Nova venda**, a modalidade **Cartão da loja** funciona como o crediário (parcelas, limite e bloqueio por atraso), mas exige a leitura do cartão. Em **Crediário / fiado** a leitura é opcional.
- Para identificar o cartão: digite o código, passe o **leitor de código de barras** (USB/Bluetooth, que digita o código e envia Enter) ou use o botão **Câmera** (exige HTTPS ou `localhost`).
- Ao ler o cartão abre a tela com dados do cliente, status do cartão, limite aprovado, em aberto, disponível e parcelas vencidas. Cartão bloqueado/cancelado, cliente sem limite, com parcela vencida ou sem limite disponível não pode ser usado.
- A venda no cartão da loja é revalidada ao finalizar e novamente no banco (trigger).


## Aumento de limite no ato da venda (permanente ou temporário)

- **Instalação:** execute `supabase/migration_aumento_limite.sql` no SQL Editor do Supabase (depois de `migration_cartao_loja.sql`). Ela cria a tabela `aumentos_limite`, as funções de concessão/desfazer e atualiza a trava do banco para usar o **limite efetivo** (limite aprovado + aumentos temporários ativos).
- Em **Nova venda** (Cartão da loja e Crediário), se a venda for maior que o limite disponível, em vez de bloquear abre a tela **Limite insuficiente** mostrando quanto falta. O operador escolhe:
  - **Aumento temporário:** vale por cima do limite do cliente. Cada real pago em qualquer parcela dele abate 1 real do aumento; quando o valor do aumento é pago (ou a dívida volta a caber no limite original) o limite volta ao original. Cancelar/excluir a venda encerra o aumento dela.
  - **Aumento permanente:** soma o valor ao `limite_aprovado` do cliente, exige motivo e fica registrado em `analises_credito` (histórico do Zer01 Score) e em `aumentos_limite`.
- O aumento precisa cobrir pelo menos o que falta para a venda. Se a venda falhar depois do aumento ser aplicado, ele é desfeito automaticamente.
- Cliente com parcela vencida, sem limite aprovado ou com crédito negado **não** pode ter o limite aumentado.
- Um cartão com limite totalmente usado agora pode ser lido; o aumento é oferecido ao finalizar a venda.

## Gastos e investimentos (fase 1)

- **Instalação:** execute `supabase/migration_gastos.sql` no SQL Editor do Supabase. Ela cria `despesas`, `compras_lotes` e `compras_itens` e a função `zer01_salvar_lote`.
- A aba **Gastos** é exclusiva do administrador, no menu, na página e no banco (RLS por e-mail). Para incluir outro administrador, edite a lista de e-mails em `zer01_is_admin()` na migração e rode de novo.
- **Despesas da loja:** categoria, valor, data, "já paga" ou "a pagar" (com vencimento), forma de pagamento e observação. O botão **Lançar recorrentes do mês** copia, como "a pagar", as despesas marcadas como recorrentes no mês passado que ainda não foram lançadas neste mês.
- **Investimentos (peças):** cada compra é um lote com fornecedor, data e itens (descrição, quantidade, custo e venda unitários). O sistema calcula custo total, venda prevista, lucro previsto e margem.
- **Resumo e lucro:** escolha o período e a receita considerada (por venda ou por recebimento). Resultado = receita − despesas − compras de peças. Também mostra lucro projetado por lote, itens com maior lucro previsto, despesas por categoria e despesas a pagar.
- Nesta fase as compras não são ligadas às vendas: o lucro dos lotes é **projetado** (se tudo for vendido pelo preço planejado), não o lucro real de cada venda.


## Carnê digital (integrado ao sistema)

O antigo sistema de carnês foi incorporado a este projeto. **Os links que já foram enviados aos clientes continuam iguais**:

| Link | O que abre |
|---|---|
| `/?carne=CODIGO` | Carnê digital do cliente, com os dados ao vivo do sistema |
| `/?token=TOKEN` | Pagamento de uma parcela (inclui as cobranças/PDFs antigos) |

`index.html` agora é a página pública do cliente. Sem `?carne=`/`?token=` ela apenas redireciona para o `dashboard.html`.

### Como usar
Em **Contas a receber**, o botão **CARNÊ** abre uma janela que:
- cria o carnê do cliente da venda (escolhendo a chave PIX, multa e juros) ou, se o cliente já tiver carnê, **mostra o mesmo link de sempre**;
- permite copiar o link, enviar por WhatsApp e **baixar o PDF para impressão** (o QR Code aponta para o carnê digital, que mostra sempre o valor e a situação atuais).

### Na tela de Vendas
Ao registrar uma venda no crediário ou cartão da loja, depois da pergunta do comprovante o sistema pergunta: **Enviar link do carnê** (abre o link do cliente com botões Copiar e WhatsApp), **Gerar carnê (PDF)** ou **Agora não**. Se o cliente ainda não tiver carnê, pede a chave PIX e cria. Vendas à vista ou sem cliente não perguntam.

### Instalação / publicação (Vercel)
1. Execute `supabase/migration_carnes.sql` no SQL Editor do Supabase. É seguro para quem já usa o carnê: só cria o que não existir.
2. No projeto da Vercel que servirá o sistema, configure as variáveis de ambiente (as **mesmas** do projeto de carnês atual):
   - `CARNE_SECRET` — **precisa ser o mesmo valor de hoje**. Os links `?token=` já enviados são assinados com ele; se mudar, deixam de funcionar.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (somente aqui, no servidor; nunca no frontend).
3. Publique **na mesma URL/domínio dos carnês já enviados** (ou adicione esse domínio ao projeto), para que os links antigos abram neste sistema.

### Segurança da API (`api/cobranca.js`)
- Públicos (necessários para os links dos clientes): `GET ?carne=`, `GET ?token=` e a ação `criarTokenParcela`.
- Exigem login no sistema (token de sessão do Supabase): `criarCarne`, `listarCarnes`, `consultarCarne` e a geração de cobranças avulsas.

### Aba Carnês (`carnes.html`)
Menu **Carnês** (disponível para administrador e vendedor). Mostra:
- **Carnês existentes:** todos os clientes que já têm carnê ativo, com valor em aberto, parcelas atrasadas, próximo vencimento e as ações **Ver carnê** (mesmo link de sempre, WhatsApp, PDF), **Copiar link** e **PDF**.
- **Com dívida, sem carnê:** clientes com parcelas em aberto que ainda não têm carnê, com o botão **Gerar carnê** (escolhe a chave PIX, multa e juros).
- **Todos os clientes**, com busca por nome, CPF/CNPJ ou telefone.

O carnê continua sendo **um por cliente**: o link `/?carne=CODIGO` mostra todas as parcelas dele, de todas as vendas. O **PDF** da aba reúne as parcelas em aberto de todas as vendas ativas do cliente (vendas canceladas ficam de fora). Não há migração nova: usa as tabelas `carnes`, `chaves_pix`, `clientes` e `parcelas` já existentes.

