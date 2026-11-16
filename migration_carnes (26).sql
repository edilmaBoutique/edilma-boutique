-- ============================================================
-- SISTEMA ZER01 — CARNÊ DIGITAL (integração)
--
-- Documenta e garante as tabelas que o sistema de carnês já usava
-- em produção: `carnes` e `chaves_pix`.
--
-- É SEGURO rodar em quem já tem o carnê funcionando:
--   * usa "create ... if not exists" (não altera tabelas existentes);
--   * não apaga nem muda nenhum carnê / link já criado;
--   * os códigos de acesso (codigo_acesso) existentes continuam
--     valendo, então os links /?carne=CODIGO já enviados não mudam.
--
-- Execute no SQL Editor do Supabase (depois de schema.sql).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- chaves_pix: chaves PIX que o operador escolhe ao criar o carnê
-- ------------------------------------------------------------
create table if not exists public.chaves_pix (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  banco text null,
  tipo text null,
  chave text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------
-- carnes: um carnê digital por cliente.
-- codigo_acesso é o segredo do link  /?carne=CODIGO
-- ------------------------------------------------------------
create table if not exists public.carnes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  venda_id uuid null,
  codigo_acesso text not null,
  multa numeric not null default 2,
  juros numeric not null default 0.033,
  pix text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint carnes_cliente_id_fkey
    foreign key (cliente_id)
    references public.clientes(id)
    on update cascade
    on delete cascade,
  constraint carnes_venda_id_fkey
    foreign key (venda_id)
    references public.vendas(id)
    on update cascade
    on delete set null
);

create unique index if not exists carnes_codigo_acesso_key
  on public.carnes (codigo_acesso);

create index if not exists carnes_cliente_id_idx
  on public.carnes (cliente_id);

-- Um único carnê ativo por cliente. Se já existirem duplicados em
-- produção o índice não é criado (apenas avisa) e nada é alterado.
do $$
begin
  create unique index if not exists carnes_um_ativo_por_cliente
    on public.carnes (cliente_id) where ativo;
exception when unique_violation then
  raise notice 'Há clientes com mais de um carnê ativo: índice carnes_um_ativo_por_cliente não criado. Desative os duplicados e rode novamente.';
end
$$;

-- ------------------------------------------------------------
-- RLS
-- A API (/api/cobranca) usa a service_role e ignora o RLS.
-- Com o RLS ligado, a chave pública (anon) NÃO consegue ler os
-- códigos de acesso dos carnês; só usuários logados no sistema.
-- ------------------------------------------------------------
alter table public.carnes enable row level security;
alter table public.chaves_pix enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'carnes'
      and policyname = 'carnes_authenticated_all'
  ) then
    create policy carnes_authenticated_all
      on public.carnes
      for all
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chaves_pix'
      and policyname = 'chaves_pix_authenticated_all'
  ) then
    create policy chaves_pix_authenticated_all
      on public.chaves_pix
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end
$$;
