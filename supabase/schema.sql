-- =====================================================================
-- Enquetes da Comissão de Melhorias — Residencial Living Garden
-- Banco de dados (Supabase / Postgres)
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este arquivo
-- inteiro e clique em "Run". Pode ser executado de novo sem perder dados.
--
-- Regras que este arquivo garante:
--   * cada apartamento vota uma única vez por enquete;
--   * todo voto registra o nome de quem votou;
--   * o público enxerga apenas totais, nunca nomes nem o voto de cada apartamento;
--   * só administradores cadastrados criam enquetes e veem os votos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create table if not exists public.administradores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.apartamentos (
  id     text primary key check (id ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'),
  torre  text not null,
  numero int  not null,
  ativo  boolean not null default true,
  unique (torre, numero)
);

create table if not exists public.enquetes (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (char_length(titulo) between 3 and 160),
  descricao  text not null default '' check (char_length(descricao) <= 2000),
  status     text not null default 'rascunho'
             check (status in ('rascunho', 'aberta', 'encerrada')),
  -- 'sempre': placar visível durante a votação; 'ao_encerrar': só no fim
  resultado  text not null default 'sempre'
             check (resultado in ('sempre', 'ao_encerrar')),
  encerra_em timestamptz,
  criada_em  timestamptz not null default now()
);

create table if not exists public.opcoes (
  id         uuid primary key default gen_random_uuid(),
  enquete_id uuid not null references public.enquetes (id) on delete cascade,
  texto      text not null check (char_length(texto) between 1 and 120),
  ordem      int  not null default 0
);
create index if not exists opcoes_enquete_idx on public.opcoes (enquete_id);

create table if not exists public.votos (
  enquete_id     uuid not null references public.enquetes (id) on delete cascade,
  apartamento_id text not null references public.apartamentos (id) on delete cascade,
  opcao_id       uuid not null references public.opcoes (id) on delete cascade,
  nome           text not null check (char_length(nome) between 5 and 80),
  criado_em      timestamptz not null default now(),
  -- um voto por apartamento em cada enquete
  primary key (enquete_id, apartamento_id)
);
create index if not exists votos_opcao_idx on public.votos (opcao_id);

-- ---------------------------------------------------------------------
-- Apartamentos do Residencial Living Garden (85 unidades)
--   Torre Árvores: 17 andares, finais 01 e 02  (101 a 1702) = 34
--   Torre Frutos:  17 andares, finais 01 a 03  (101 a 1703) = 51
-- Para desativar uma unidade: update apartamentos set ativo = false where id = 'ARV-101';
-- ---------------------------------------------------------------------

insert into public.apartamentos (id, torre, numero)
select 'ARV-' || (andar * 100 + final), 'Árvores', andar * 100 + final
from generate_series(1, 17) as andar, generate_series(1, 2) as final
on conflict (id) do nothing;

insert into public.apartamentos (id, torre, numero)
select 'FRU-' || (andar * 100 + final), 'Frutos', andar * 100 + final
from generate_series(1, 17) as andar, generate_series(1, 3) as final
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Quem é administrador
-- ---------------------------------------------------------------------

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.administradores where user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- Permissões e regras de acesso (RLS)
-- ---------------------------------------------------------------------

alter table public.administradores enable row level security;
alter table public.apartamentos    enable row level security;
alter table public.enquetes        enable row level security;
alter table public.opcoes          enable row level security;
alter table public.votos           enable row level security;

revoke all on table public.administradores from anon, authenticated;
revoke all on table public.apartamentos    from anon, authenticated;
revoke all on table public.enquetes        from anon, authenticated;
revoke all on table public.opcoes          from anon, authenticated;
revoke all on table public.votos           from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Público: lê enquetes publicadas, suas opções e a lista de apartamentos. Nada mais.
grant select on table public.enquetes, public.opcoes, public.apartamentos to anon, authenticated;

-- Administração (as políticas abaixo restringem a quem está em "administradores")
grant insert, update, delete on table public.enquetes, public.opcoes to authenticated;
grant select, delete on table public.votos to authenticated;
grant select on table public.administradores to authenticated;

drop policy if exists "publico le enquetes publicadas" on public.enquetes;
create policy "publico le enquetes publicadas" on public.enquetes
  for select to anon, authenticated
  using (status <> 'rascunho' or public.eh_admin());

drop policy if exists "admin gerencia enquetes" on public.enquetes;
create policy "admin gerencia enquetes" on public.enquetes
  for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "publico le opcoes publicadas" on public.opcoes;
create policy "publico le opcoes publicadas" on public.opcoes
  for select to anon, authenticated
  using (exists (
    select 1 from public.enquetes e
    where e.id = enquete_id and (e.status <> 'rascunho' or public.eh_admin())
  ));

drop policy if exists "admin gerencia opcoes" on public.opcoes;
create policy "admin gerencia opcoes" on public.opcoes
  for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "publico le apartamentos ativos" on public.apartamentos;
create policy "publico le apartamentos ativos" on public.apartamentos
  for select to anon, authenticated using (ativo);

drop policy if exists "admin le votos" on public.votos;
create policy "admin le votos" on public.votos
  for select to authenticated using (public.eh_admin());

drop policy if exists "admin anula votos" on public.votos;
create policy "admin anula votos" on public.votos
  for delete to authenticated using (public.eh_admin());

drop policy if exists "admin le o proprio cadastro" on public.administradores;
create policy "admin le o proprio cadastro" on public.administradores
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Funções públicas
-- ---------------------------------------------------------------------

-- Registra um voto. Devolve um código de situação em texto:
--   ok | ja_votou | nome_invalido | apartamento_invalido | encerrada
--   | opcao_invalida | enquete_inexistente
create or replace function public.votar(
  p_enquete     uuid,
  p_opcao       uuid,
  p_apartamento text,
  p_nome        text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   text := upper(btrim(coalesce(p_apartamento, '')));
  v_nome text := regexp_replace(btrim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_enq  public.enquetes%rowtype;
begin
  select * into v_enq from public.enquetes where id = p_enquete;
  if not found or v_enq.status = 'rascunho' then
    return 'enquete_inexistente';
  end if;
  if v_enq.status <> 'aberta'
     or (v_enq.encerra_em is not null and now() >= v_enq.encerra_em) then
    return 'encerrada';
  end if;

  if char_length(v_nome) not between 5 and 80 then
    return 'nome_invalido';
  end if;

  if not exists (select 1 from public.apartamentos where id = v_id and ativo) then
    return 'apartamento_invalido';
  end if;

  if not exists (
    select 1 from public.opcoes where id = p_opcao and enquete_id = p_enquete
  ) then
    return 'opcao_invalida';
  end if;

  begin
    insert into public.votos (enquete_id, apartamento_id, opcao_id, nome)
    values (p_enquete, v_id, p_opcao, v_nome);
  exception when unique_violation then
    return 'ja_votou';
  end;

  return 'ok';
end;
$$;

-- Placar de uma enquete: só totais (geral, por opção e por torre). Respeita a opção "ao_encerrar".
create or replace function public.resultado(p_enquete uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enq     public.enquetes%rowtype;
  v_admin   boolean := public.eh_admin();
  v_visivel boolean;
  v_votos   int;
  v_aptos   int;
  v_opcoes  jsonb;
  v_torres  jsonb;
begin
  select * into v_enq from public.enquetes where id = p_enquete;
  if not found or (v_enq.status = 'rascunho' and not v_admin) then
    return null;
  end if;

  -- participação por torre (só contagens)
  select coalesce(jsonb_agg(
           jsonb_build_object('torre', t.torre, 'apartamentos', t.aptos, 'votos', t.votos)
           order by t.torre), '[]'::jsonb)
    into v_torres
  from (
    select a.torre, count(*) as aptos, count(v.apartamento_id) as votos
    from public.apartamentos a
    left join public.votos v
      on v.apartamento_id = a.id and v.enquete_id = p_enquete
    where a.ativo
    group by a.torre
  ) t;

  select count(*) into v_votos from public.votos where enquete_id = p_enquete;
  select count(*) into v_aptos from public.apartamentos where ativo;

  v_visivel := v_admin
            or v_enq.resultado = 'sempre'
            or v_enq.status = 'encerrada'
            or (v_enq.encerra_em is not null and now() >= v_enq.encerra_em);

  if v_visivel then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', o.id,
               'votos', (select count(*) from public.votos v where v.opcao_id = o.id)
             ) order by o.ordem, o.texto), '[]'::jsonb)
      into v_opcoes
    from public.opcoes o
    where o.enquete_id = p_enquete;
  end if;

  return jsonb_build_object(
    'visivel',      v_visivel,
    'votos',        v_votos,
    'apartamentos', v_aptos,
    'torres',       v_torres,
    'opcoes',       v_opcoes
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Função da administração
-- ---------------------------------------------------------------------

-- Cria uma enquete em rascunho, com as opções na ordem informada
create or replace function public.admin_criar_enquete(
  p_titulo     text,
  p_descricao  text,
  p_resultado  text,
  p_encerra_em timestamptz,
  p_opcoes     text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_texto text;
  v_i     int := 0;
begin
  if not public.eh_admin() then
    raise exception 'sem_permissao';
  end if;
  if p_opcoes is null or coalesce(array_length(p_opcoes, 1), 0) < 2 then
    raise exception 'minimo_duas_opcoes';
  end if;

  insert into public.enquetes (titulo, descricao, resultado, encerra_em)
  values (btrim(p_titulo), btrim(coalesce(p_descricao, '')),
          coalesce(p_resultado, 'sempre'), p_encerra_em)
  returning id into v_id;

  foreach v_texto in array p_opcoes loop
    v_i := v_i + 1;
    insert into public.opcoes (enquete_id, texto, ordem)
    values (v_id, btrim(v_texto), v_i);
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Quem pode chamar cada função
-- ---------------------------------------------------------------------

revoke execute on function public.eh_admin()                          from public;
revoke execute on function public.votar(uuid, uuid, text, text)       from public;
revoke execute on function public.resultado(uuid)                     from public;
revoke execute on function public.admin_criar_enquete(text, text, text, timestamptz, text[]) from public, anon;

grant execute on function public.eh_admin()                           to anon, authenticated;
grant execute on function public.votar(uuid, uuid, text, text)        to anon, authenticated;
grant execute on function public.resultado(uuid)                      to anon, authenticated;
grant execute on function public.admin_criar_enquete(text, text, text, timestamptz, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- Depois de rodar este arquivo: cadastre o primeiro administrador.
-- 1) Em Authentication > Users, crie o usuário (e-mail e senha).
-- 2) Rode, trocando o e-mail:
--
--   insert into public.administradores (user_id)
--   select id from auth.users where email = 'comissao@exemplo.com';
-- ---------------------------------------------------------------------
