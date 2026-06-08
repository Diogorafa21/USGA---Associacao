-- USGA - Esquema Supabase inicial
-- Execute este ficheiro no SQL Editor do Supabase antes de ligar as paginas ao backend.

create extension if not exists "pgcrypto";

-- Helpers --------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Utilizadores e socios -------------------------------------------------------

create table if not exists public.utilizadores (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  apelido text,
  email text not null unique,
  telefone text,
  nif text unique,
  cc text,
  data_nascimento date,
  cidade text,
  pais text default 'Portugal',
  numero_socio text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  estado text not null default 'ativo' check (estado in ('ativo', 'inativo', 'bloqueado')),
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger utilizadores_set_updated_at
before update on public.utilizadores
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.utilizadores
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create table if not exists public.pedidos_socio (
  id uuid primary key default gen_random_uuid(),
  utilizador_id uuid references public.utilizadores(id) on delete set null,
  nome text not null,
  apelido text not null,
  email text not null,
  telefone text,
  nif text,
  cc text,
  data_nascimento date,
  cidade text,
  estado text not null default 'pendente' check (estado in ('pendente', 'aprovado', 'rejeitado', 'cancelado')),
  observacoes_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pedidos_socio_set_updated_at
before update on public.pedidos_socio
for each row execute function public.set_updated_at();

-- Quotas ----------------------------------------------------------------------

create table if not exists public.quotas (
  id uuid primary key default gen_random_uuid(),
  utilizador_id uuid not null references public.utilizadores(id) on delete cascade,
  ano integer not null check (ano >= 2020),
  valor numeric(10,2) not null default 12.00,
  data_limite date,
  estado text not null default 'por_pagar' check (estado in ('por_pagar', 'pendente_validacao', 'pago', 'isento', 'cancelado')),
  data_pagamento date,
  fatura_url text,
  associados_app_id text,
  associados_app_url text,
  origem text not null default 'usga' check (origem in ('usga', 'associados_app', 'importacao')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (utilizador_id, ano)
);

create trigger quotas_set_updated_at
before update on public.quotas
for each row execute function public.set_updated_at();

-- Eventos e inscricoes --------------------------------------------------------

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  categoria text,
  descricao_curta text,
  descricao text,
  recomendacoes text,
  data_evento timestamptz not null,
  data_fim_inscricoes timestamptz,
  local text,
  preco_socio numeric(10,2) default 0,
  preco_nao_socio numeric(10,2) default 0,
  vagas integer,
  estado text not null default 'rascunho' check (estado in ('rascunho', 'aberto', 'fechado', 'concluido', 'cancelado')),
  regulamento_url text,
  imagem_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger eventos_set_updated_at
before update on public.eventos
for each row execute function public.set_updated_at();

create table if not exists public.inscricoes_evento (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  utilizador_id uuid references public.utilizadores(id) on delete set null,
  public_token uuid not null default gen_random_uuid(),
  nome text not null,
  email text not null,
  telefone text,
  nif text,
  bi text,
  data_nascimento date,
  sexo text check (sexo in ('F', 'M', 'Outro')),
  pais text default 'Portugal',
  equipa text,
  dorsal text,
  estado text not null default 'aguardando_pagamento' check (estado in ('aguardando_pagamento', 'confirmada', 'rejeitada', 'cancelada')),
  pagamento_estado text not null default 'pendente' check (pagamento_estado in ('pendente', 'em_validacao', 'validado', 'rejeitado')),
  data_inscricao timestamptz not null default now(),
  data_confirmacao timestamptz,
  observacoes_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evento_id, email)
);

create index if not exists inscricoes_evento_evento_idx on public.inscricoes_evento(evento_id);
create index if not exists inscricoes_evento_utilizador_idx on public.inscricoes_evento(utilizador_id);
create unique index if not exists inscricoes_evento_public_token_idx on public.inscricoes_evento(public_token);

create trigger inscricoes_evento_set_updated_at
before update on public.inscricoes_evento
for each row execute function public.set_updated_at();

-- Pagamentos e comprovativos --------------------------------------------------

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('quota', 'evento')),
  utilizador_id uuid references public.utilizadores(id) on delete set null,
  quota_id uuid references public.quotas(id) on delete cascade,
  inscricao_evento_id uuid references public.inscricoes_evento(id) on delete cascade,
  valor numeric(10,2) not null,
  metodo text not null default 'transferencia' check (metodo in ('transferencia', 'mbway', 'dinheiro', 'outro')),
  referencia text,
  comprovativo_url text,
  estado text not null default 'pendente' check (estado in ('pendente', 'em_validacao', 'validado', 'rejeitado')),
  validado_por uuid references public.utilizadores(id) on delete set null,
  validado_em timestamptz,
  observacoes_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (tipo = 'quota' and quota_id is not null and inscricao_evento_id is null)
    or
    (tipo = 'evento' and inscricao_evento_id is not null and quota_id is null)
  )
);

create trigger pagamentos_set_updated_at
before update on public.pagamentos
for each row execute function public.set_updated_at();

-- Formularios de suporte / sugestoes -----------------------------------------

create table if not exists public.mensagens_suporte (
  id uuid primary key default gen_random_uuid(),
  utilizador_id uuid references public.utilizadores(id) on delete set null,
  nome text not null,
  email text not null,
  assunto text not null,
  mensagem text not null,
  estado text not null default 'novo' check (estado in ('novo', 'em_analise', 'respondido', 'arquivado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mensagens_suporte_set_updated_at
before update on public.mensagens_suporte
for each row execute function public.set_updated_at();

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.utilizadores(id) on delete set null,
  acao text not null,
  tabela text,
  registo_id uuid,
  detalhes jsonb,
  created_at timestamptz not null default now()
);

-- Vistas e funcoes publicas ---------------------------------------------------

create or replace view public.inscritos_publicos as
select
  i.evento_id,
  i.nome,
  coalesce(i.pais, 'Portugal') as pais,
  i.equipa,
  i.dorsal,
  i.data_confirmacao
from public.inscricoes_evento i
where i.estado = 'confirmada'
  and i.pagamento_estado = 'validado';

create or replace function public.get_estado_inscricao(token uuid)
returns table (
  evento_titulo text,
  nome text,
  estado text,
  pagamento_estado text,
  dorsal text,
  data_inscricao timestamptz,
  data_confirmacao timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.titulo,
    i.nome,
    i.estado,
    i.pagamento_estado,
    i.dorsal,
    i.data_inscricao,
    i.data_confirmacao
  from public.inscricoes_evento i
  join public.eventos e on e.id = i.evento_id
  where i.public_token = token;
$$;

-- Criacao automatica de perfil apos auth.signUp -------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.utilizadores (id, nome, apelido, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'apelido',
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.atualizar_meu_perfil(
  p_nome text,
  p_apelido text,
  p_telefone text,
  p_data_nascimento date,
  p_cidade text,
  p_pais text,
  p_foto_url text
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
    nome = coalesce(nullif(trim(p_nome), ''), nome),
    apelido = nullif(trim(p_apelido), ''),
    telefone = nullif(trim(p_telefone), ''),
    data_nascimento = p_data_nascimento,
    cidade = nullif(trim(p_cidade), ''),
    pais = coalesce(nullif(trim(p_pais), ''), pais),
    foto_url = nullif(trim(p_foto_url), '')
  where id = auth.uid()
  returning * into perfil;

  return perfil;
end;
$$;

-- RLS -------------------------------------------------------------------------

alter table public.utilizadores enable row level security;
alter table public.pedidos_socio enable row level security;
alter table public.quotas enable row level security;
alter table public.eventos enable row level security;
alter table public.inscricoes_evento enable row level security;
alter table public.pagamentos enable row level security;
alter table public.mensagens_suporte enable row level security;
alter table public.audit_logs enable row level security;

create policy "utilizadores_select_own_or_admin"
on public.utilizadores for select
using (id = auth.uid() or public.is_admin());

create policy "utilizadores_admin_update"
on public.utilizadores for update
using (public.is_admin())
with check (public.is_admin());

create policy "pedidos_socio_insert_public"
on public.pedidos_socio for insert
with check (estado = 'pendente');

create policy "pedidos_socio_select_own_or_admin"
on public.pedidos_socio for select
using (utilizador_id = auth.uid() or public.is_admin());

create policy "pedidos_socio_admin_update"
on public.pedidos_socio for update
using (public.is_admin())
with check (public.is_admin());

create policy "quotas_select_own_or_admin"
on public.quotas for select
using (utilizador_id = auth.uid() or public.is_admin());

create policy "quotas_admin_all"
on public.quotas for all
using (public.is_admin())
with check (public.is_admin());

create policy "eventos_public_select"
on public.eventos for select
using (estado in ('aberto', 'fechado', 'concluido') or public.is_admin());

create policy "eventos_admin_all"
on public.eventos for all
using (public.is_admin())
with check (public.is_admin());

create policy "inscricoes_insert_public_or_own"
on public.inscricoes_evento for insert
with check (
  (utilizador_id is null or utilizador_id = auth.uid())
  and estado = 'aguardando_pagamento'
  and pagamento_estado = 'pendente'
  and data_confirmacao is null
);

create policy "inscricoes_select_own_or_admin"
on public.inscricoes_evento for select
using (utilizador_id = auth.uid() or public.is_admin());

create policy "inscricoes_admin_update"
on public.inscricoes_evento for update
using (public.is_admin())
with check (public.is_admin());

create policy "pagamentos_insert_own_or_public"
on public.pagamentos for insert
with check (
  (utilizador_id is null or utilizador_id = auth.uid())
  and estado in ('pendente', 'em_validacao')
  and validado_por is null
  and validado_em is null
);

create policy "pagamentos_select_own_or_admin"
on public.pagamentos for select
using (utilizador_id = auth.uid() or public.is_admin());

create policy "pagamentos_admin_update"
on public.pagamentos for update
using (public.is_admin())
with check (public.is_admin());

create policy "mensagens_suporte_insert_public"
on public.mensagens_suporte for insert
with check (estado = 'novo');

create policy "mensagens_suporte_select_own_or_admin"
on public.mensagens_suporte for select
using (utilizador_id = auth.uid() or public.is_admin());

create policy "mensagens_suporte_admin_update"
on public.mensagens_suporte for update
using (public.is_admin())
with check (public.is_admin());

create policy "audit_logs_admin_select"
on public.audit_logs for select
using (public.is_admin());

create policy "audit_logs_admin_insert"
on public.audit_logs for insert
with check (public.is_admin());

-- Grants para a API publica do Supabase --------------------------------------

grant usage on schema public to anon, authenticated;

grant select on public.eventos to anon, authenticated;
grant select on public.inscritos_publicos to anon, authenticated;
grant execute on function public.get_estado_inscricao(uuid) to anon, authenticated;

grant select, update on public.utilizadores to authenticated;
grant execute on function public.atualizar_meu_perfil(text, text, text, date, text, text, text) to authenticated;

grant insert on public.pedidos_socio to anon, authenticated;
grant select, update on public.pedidos_socio to authenticated;

grant select, insert, update on public.quotas to authenticated;

grant insert on public.inscricoes_evento to anon, authenticated;
grant select, update on public.inscricoes_evento to authenticated;

grant insert on public.pagamentos to anon, authenticated;
grant select, update on public.pagamentos to authenticated;

grant insert on public.mensagens_suporte to anon, authenticated;
grant select, update on public.mensagens_suporte to authenticated;

grant select, insert on public.audit_logs to authenticated;
