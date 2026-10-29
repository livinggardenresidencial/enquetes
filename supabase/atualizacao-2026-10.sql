-- =====================================================================
-- Atualização de outubro/2026 — cada enquete indica quem a promove
-- (Administração, Comissão de Melhorias...).
--
-- Para o banco que JÁ ESTÁ no ar: abra o SQL Editor do Supabase, cole
-- este arquivo inteiro e clique em Run. Não apaga nenhum dado e pode ser
-- rodado de novo sem problema.
-- =====================================================================

-- Quem promove a enquete (acrescentado em outubro/2026).
-- Enquetes que já existiam ficam com "Comissão de Melhorias"; as novas, por padrão, "Administração".
alter table public.enquetes
  add column if not exists responsavel text not null default 'Comissão de Melhorias';
alter table public.enquetes alter column responsavel set default 'Administração';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enquetes_responsavel_tamanho') then
    alter table public.enquetes
      add constraint enquetes_responsavel_tamanho check (char_length(responsavel) between 2 and 80);
  end if;
end
$$;


-- Cria uma enquete em rascunho, com as opções na ordem informada
drop function if exists public.admin_criar_enquete(text, text, text, timestamptz, text[]);

create or replace function public.admin_criar_enquete(
  p_titulo      text,
  p_descricao   text,
  p_resultado   text,
  p_encerra_em  timestamptz,
  p_opcoes      text[],
  p_responsavel text default 'Administração'
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

  insert into public.enquetes (titulo, descricao, resultado, encerra_em, responsavel)
  values (btrim(p_titulo), btrim(coalesce(p_descricao, '')),
          coalesce(p_resultado, 'sempre'), p_encerra_em,
          coalesce(nullif(btrim(p_responsavel), ''), 'Administração'))
  returning id into v_id;

  foreach v_texto in array p_opcoes loop
    v_i := v_i + 1;
    insert into public.opcoes (enquete_id, texto, ordem)
    values (v_id, btrim(v_texto), v_i);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.admin_criar_enquete(text, text, text, timestamptz, text[], text) from public, anon;
grant execute on function public.admin_criar_enquete(text, text, text, timestamptz, text[], text) to authenticated;
