-- ============================================================
-- USGA - Correções ao Schema
-- Colar e executar no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. CORRIGIR RLS - Inserções públicas não conseguem ler de volta
-- Problema: insert().select() falha porque a política de SELECT
-- exige auth.uid() = utilizador_id, mas utilizador_id pode ser
-- NULL em inscrições públicas (sem login).
-- ============================================================

-- Pedidos de sócio: permitir ler o próprio registo após inserção
drop policy if exists "pedidos_socio_select_own_or_admin" on public.pedidos_socio;
create policy "pedidos_socio_select_own_or_admin"
on public.pedidos_socio for select
using (
  utilizador_id = auth.uid()
  or public.is_admin()
  or (utilizador_id is null and auth.uid() is null) -- anon lê o que acabou de inserir
);

-- Inscrições: utilizador anónimo consegue ler a inscrição que acabou de criar
drop policy if exists "inscricoes_select_own_or_admin" on public.inscricoes_evento;
create policy "inscricoes_select_own_or_admin"
on public.inscricoes_evento for select
using (
  utilizador_id = auth.uid()
  or public.is_admin()
  or (utilizador_id is null and email = current_setting('request.jwt.claims', true)::json->>'email')
);

-- Inscrições: permitir SELECT por public_token (para estado-inscricao.html)
-- Já coberto pela função get_estado_inscricao (security definer) — OK

-- Pagamentos: utilizador anónimo consegue ler o pagamento que criou
drop policy if exists "pagamentos_select_own_or_admin" on public.pagamentos;
create policy "pagamentos_select_own_or_admin"
on public.pagamentos for select
using (
  utilizador_id = auth.uid()
  or public.is_admin()
  or utilizador_id is null
);

-- Mensagens de suporte: permitir ler a mensagem que acabou de inserir
drop policy if exists "mensagens_suporte_select_own_or_admin" on public.mensagens_suporte;
create policy "mensagens_suporte_select_own_or_admin"
on public.mensagens_suporte for select
using (
  utilizador_id = auth.uid()
  or public.is_admin()
  or utilizador_id is null
);

-- ============================================================
-- 2. CORRIGIR atualizar_meu_perfil - Adicionar NIF
-- Problema: o RPC não aceita NIF, mas o perfil.html permite editá-lo
-- ============================================================

drop function if exists public.atualizar_meu_perfil(text, text, text, date, text, text, text);

create or replace function public.atualizar_meu_perfil(
  p_nome text,
  p_apelido text,
  p_telefone text,
  p_data_nascimento date,
  p_cidade text,
  p_pais text,
  p_foto_url text,
  p_nif text default null
)
returns public.utilizadores
language plpgsql
security definer
set search_path = public
as $$
declare
  perfil public.utilizadores;
begin
  update public.utilizadores
  set
    nome            = coalesce(nullif(trim(p_nome), ''), nome),
    apelido         = nullif(trim(p_apelido), ''),
    telefone        = nullif(trim(p_telefone), ''),
    data_nascimento = p_data_nascimento,
    cidade          = nullif(trim(p_cidade), ''),
    pais            = coalesce(nullif(trim(p_pais), ''), pais),
    foto_url        = nullif(trim(p_foto_url), ''),
    nif             = nullif(trim(p_nif), '')
  where id = auth.uid()
  returning * into perfil;

  return perfil;
end;
$$;

-- Atualizar grant para a nova assinatura
grant execute on function public.atualizar_meu_perfil(text, text, text, date, text, text, text, text) to authenticated;

-- ============================================================
-- 3. CORRIGIR eventos do seed - Não aparecem na página
-- Problema: datas passadas + estado 'aberto' faz com que
-- getEventosFuturos() e getEventosPassados() os ignorem
-- ============================================================

-- Marcar eventos passados como 'concluido' para aparecerem no arquivo
update public.eventos
set estado = 'concluido'
where data_evento < now()
  and estado = 'aberto';

-- ============================================================
-- 4. ADICIONAR RPC validar_pagamento - Pagamentos transacionais
-- Valida o pagamento e atualiza a inscrição/quota em simultâneo
-- ============================================================

create or replace function public.validar_pagamento(
  p_pagamento_id uuid,
  p_dorsal text default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pagamento public.pagamentos;
  v_admin_id  uuid := auth.uid();
begin
  -- Só admins podem validar
  if not public.is_admin() then
    raise exception 'Sem permissão';
  end if;

  -- Buscar pagamento
  select * into v_pagamento from public.pagamentos where id = p_pagamento_id;
  if not found then
    raise exception 'Pagamento não encontrado';
  end if;

  -- Atualizar pagamento
  update public.pagamentos set
    estado        = 'validado',
    validado_por  = v_admin_id,
    validado_em   = now(),
    observacoes_admin = p_observacoes
  where id = p_pagamento_id;

  -- Se for pagamento de evento, confirmar inscrição
  if v_pagamento.tipo = 'evento' and v_pagamento.inscricao_evento_id is not null then
    update public.inscricoes_evento set
      estado           = 'confirmada',
      pagamento_estado = 'validado',
      dorsal           = coalesce(p_dorsal, dorsal),
      data_confirmacao = now()
    where id = v_pagamento.inscricao_evento_id;
  end if;

  -- Se for pagamento de quota, marcar como paga
  if v_pagamento.tipo = 'quota' and v_pagamento.quota_id is not null then
    update public.quotas set
      estado         = 'pago',
      data_pagamento = now()::date
    where id = v_pagamento.quota_id;
  end if;

  -- Audit log
  insert into public.audit_logs (actor_id, acao, tabela, registo_id, detalhes)
  values (v_admin_id, 'validar_pagamento', 'pagamentos', p_pagamento_id,
    jsonb_build_object('tipo', v_pagamento.tipo, 'valor', v_pagamento.valor));

  return jsonb_build_object('ok', true, 'pagamento_id', p_pagamento_id);
end;
$$;

create or replace function public.rejeitar_pagamento(
  p_pagamento_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pagamento public.pagamentos;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão';
  end if;

  select * into v_pagamento from public.pagamentos where id = p_pagamento_id;
  if not found then
    raise exception 'Pagamento não encontrado';
  end if;

  update public.pagamentos set
    estado            = 'rejeitado',
    validado_por      = auth.uid(),
    validado_em       = now(),
    observacoes_admin = p_motivo
  where id = p_pagamento_id;

  if v_pagamento.tipo = 'evento' and v_pagamento.inscricao_evento_id is not null then
    update public.inscricoes_evento set
      estado           = 'rejeitada',
      pagamento_estado = 'rejeitado'
    where id = v_pagamento.inscricao_evento_id;
  end if;

  if v_pagamento.tipo = 'quota' and v_pagamento.quota_id is not null then
    update public.quotas set estado = 'cancelado'
    where id = v_pagamento.quota_id;
  end if;

  insert into public.audit_logs (actor_id, acao, tabela, registo_id, detalhes)
  values (auth.uid(), 'rejeitar_pagamento', 'pagamentos', p_pagamento_id,
    jsonb_build_object('motivo', p_motivo));

  return jsonb_build_object('ok', true);
end;
$$;

-- Grants para os novos RPCs
grant execute on function public.validar_pagamento(uuid, text, text) to authenticated;
grant execute on function public.rejeitar_pagamento(uuid, text) to authenticated;

-- ============================================================
-- 5. ADICIONAR RPC criar_inscricao_com_pagamento
-- Cria inscrição e registo de pagamento numa só operação
-- ============================================================

create or replace function public.criar_inscricao_com_pagamento(
  p_evento_id      uuid,
  p_nome           text,
  p_email          text,
  p_telefone       text default null,
  p_nif            text default null,
  p_bi             text default null,
  p_data_nascimento date default null,
  p_sexo           text default null,
  p_pais           text default 'Portugal',
  p_equipa         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inscricao public.inscricoes_evento;
  v_evento    public.eventos;
  v_valor     numeric(10,2);
  v_pagamento public.pagamentos;
begin
  -- Buscar evento
  select * into v_evento from public.eventos where id = p_evento_id;
  if not found then
    raise exception 'Evento não encontrado';
  end if;

  if v_evento.estado != 'aberto' then
    raise exception 'Inscrições fechadas para este evento';
  end if;

  -- Determinar valor (sócio ou não sócio)
  v_valor := v_evento.preco_nao_socio;
  if auth.uid() is not null then
    if exists (select 1 from public.utilizadores where id = auth.uid() and estado = 'ativo') then
      v_valor := v_evento.preco_socio;
    end if;
  end if;

  -- Criar inscrição
  insert into public.inscricoes_evento (
    evento_id, utilizador_id, nome, email, telefone, nif, bi,
    data_nascimento, sexo, pais, equipa
  ) values (
    p_evento_id, auth.uid(), p_nome, p_email, p_telefone, p_nif, p_bi,
    p_data_nascimento, p_sexo, p_pais, p_equipa
  )
  returning * into v_inscricao;

  -- Criar registo de pagamento
  insert into public.pagamentos (
    tipo, utilizador_id, inscricao_evento_id, valor
  ) values (
    'evento', auth.uid(), v_inscricao.id, v_valor
  )
  returning * into v_pagamento;

  return jsonb_build_object(
    'inscricao_id',   v_inscricao.id,
    'public_token',   v_inscricao.public_token,
    'pagamento_id',   v_pagamento.id,
    'valor',          v_valor,
    'evento_titulo',  v_evento.titulo
  );
end;
$$;

grant execute on function public.criar_inscricao_com_pagamento(uuid, text, text, text, text, text, date, text, text, text) to anon, authenticated;

-- ============================================================
-- 6. PERMITIR SELECT em eventos em rascunho para admin
-- (já coberto pela política existente via is_admin())
-- Garantir que anon consegue ver eventos abertos/fechados/concluidos
-- ============================================================

drop policy if exists "eventos_public_select" on public.eventos;
create policy "eventos_public_select"
on public.eventos for select
using (
  estado in ('aberto', 'fechado', 'concluido')
  or public.is_admin()
);

-- ============================================================
-- FIM DAS CORREÇÕES
-- ============================================================
