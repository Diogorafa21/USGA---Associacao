-- Executar no SQL Editor do Supabase para corrigir eliminação e lista pública de inscritos

-- Vista pública: pendentes + confirmados
create or replace view public.lista_inscritos_evento as
select
  i.evento_id,
  i.nome,
  coalesce(i.pais, 'Portugal') as pais,
  i.equipa,
  i.dorsal,
  i.data_inscricao,
  i.data_confirmacao,
  case
    when i.estado = 'confirmada' and i.pagamento_estado = 'validado' then 'confirmada'
    else 'pendente'
  end as estado_inscricao
from public.inscricoes_evento i
where i.estado not in ('rejeitada', 'cancelada');

grant select on public.lista_inscritos_evento to anon, authenticated;

-- Política e permissão de DELETE para admins
drop policy if exists "inscricoes_admin_delete" on public.inscricoes_evento;
create policy "inscricoes_admin_delete" on public.inscricoes_evento for delete
  using (public.is_admin());

grant delete on public.inscricoes_evento to authenticated;

-- RPC segura para eliminar inscrição
create or replace function public.eliminar_inscricao_evento(p_inscricao_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão'; end if;

  delete from public.inscricoes_evento where id = p_inscricao_id;
  if not found then raise exception 'Inscrição não encontrada'; end if;

  insert into public.audit_logs (actor_id, acao, tabela, registo_id)
  values (auth.uid(), 'eliminar_inscricao', 'inscricoes_evento', p_inscricao_id);

  return jsonb_build_object('ok', true);
end; $$;

grant execute on function public.eliminar_inscricao_evento(uuid) to authenticated;
