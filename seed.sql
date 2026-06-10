-- USGA - dados iniciais opcionais
-- Execute depois de `schema.sql` se quiser criar os eventos que ja aparecem no HTML.

insert into public.eventos (
  titulo,
  slug,
  categoria,
  descricao_curta,
  descricao,
  recomendacoes,
  data_evento,
  data_fim_inscricoes,
  local,
  preco_socio,
  preco_nao_socio,
  estado
) values
(
  'Caminhada da Primavera',
  'caminhada-da-primavera',
  'Natureza',
  'Um percurso de 10km pelos trilhos da nossa terra.',
  'Esta caminhada tem como objetivo promover a atividade fisica e o contacto com a natureza.',
  'Levar calcado confortavel, garrafa de agua individual e roupa adequada a meteorologia.',
  '2026-03-15 09:00:00+00',
  '2026-03-13 23:59:00+00',
  'Sede da USGA',
  0,
  5,
  'aberto'
),
(
  'Torneio de Futsal',
  'torneio-de-futsal',
  'Desporto',
  'Competicao amigavel no pavilhao gimnodesportivo.',
  'Torneio aberto a equipas locais com inscricao previa.',
  'Consultar regulamento do evento.',
  '2026-04-02 20:00:00+00',
  '2026-03-30 23:59:00+00',
  'Pavilhao Gimnodesportivo',
  0,
  0,
  'aberto'
),
(
  'Workshop de Artesanato',
  'workshop-de-artesanato',
  'Formacao',
  'Aprenda a trabalhar o barro com artesaos locais.',
  'Sessao pratica de artesanato local.',
  'Inscricao obrigatoria por limite de lugares.',
  '2026-05-20 15:00:00+00',
  '2026-05-18 23:59:00+00',
  'Sede da USGA',
  0,
  0,
  'aberto'
)
on conflict (slug) do update set
  titulo = excluded.titulo,
  categoria = excluded.categoria,
  descricao_curta = excluded.descricao_curta,
  descricao = excluded.descricao,
  recomendacoes = excluded.recomendacoes,
  data_evento = excluded.data_evento,
  data_fim_inscricoes = excluded.data_fim_inscricoes,
  local = excluded.local,
  preco_socio = excluded.preco_socio,
  preco_nao_socio = excluded.preco_nao_socio,
  estado = excluded.estado;
